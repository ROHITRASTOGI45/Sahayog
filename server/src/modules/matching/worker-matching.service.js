import { Worker } from "../workers/worker.model.js";
import { getActiveCooperativeIds } from "../workers/worker-eligibility.service.js";

const FIXED_RADIUS_KM = 10;
const MAX_CANDIDATES = 250;

const SERVICE_ALIASES = {
  plumbing: "Plumbing",
  plumber: "Plumbing",

  electrical: "Electrical",
  electrician: "Electrical",

  carpentry: "Carpentry",
  carpenter: "Carpentry",

  painting: "Painting",
  painter: "Painting",

  cleaning: "Cleaning",
  cleaner: "Cleaning",
};


// ============================================================
// NORMALIZE SERVICE
// ============================================================

const normalizeService = (value) => {
  const key = String(value || "")
    .trim()
    .toLowerCase();

  return SERVICE_ALIASES[key] || null;
};


// ============================================================
// HAVERSINE DISTANCE
// ============================================================

export const calculateDistanceKm = (
  lat1,
  lon1,
  lat2,
  lon2
) => {

  const earthRadiusKm = 6371;

  const dLat =
    ((lat2 - lat1) * Math.PI) / 180;

  const dLon =
    ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadiusKm * c;
};


// ============================================================
// FIND BEST WORKERS
// ============================================================

export const findBestWorkers = async ({
  serviceName,
  latitude,
  longitude,
  limit = MAX_CANDIDATES,
  experiencePreference = "ANY",
}) => {

  const lat = Number(latitude);
  const lon = Number(longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    throw new Error(
      "Invalid latitude or longitude"
    );
  }

  const service =
    normalizeService(serviceName);

  if (!service) {
    throw new Error(
      "Invalid service"
    );
  }

  const preference = String(experiencePreference || "ANY").trim().toUpperCase();
  if (!["ANY", "EXPERIENCED"].includes(preference)) {
    throw new Error("Invalid experience preference");
  }

  const serviceValues = Object.entries(SERVICE_ALIASES)
    .filter(([, canonical]) => canonical === service)
    .map(([alias]) => alias);
  serviceValues.push(service);

  const resultLimit = Math.min(
    Math.max(Number(limit) || 10, 1),
    MAX_CANDIDATES
  );

  // ----------------------------------------------------------
  // MongoDB geospatial query
  // ----------------------------------------------------------

  // A worker is eligible for customer services only when they belong to
  // an ACTIVE cooperative that has already been approved by the System Admin.
  const activeCooperativeIds = await getActiveCooperativeIds();

  if (!activeCooperativeIds.length) return [];

  const nearbyWorkers =
    await Worker.find({
      isActive: true,
      cooperativeId: { $in: activeCooperativeIds },

      status: "AVAILABLE",
      ...(preference === "EXPERIENCED" ? { experienceCategory: "EXPERIENCED" } : {}),

      $or: [
        { "skills.service": { $in: serviceValues } },
        { service: { $in: serviceValues } },
      ],

      currentLocation: {
        $near: {
          $geometry: {
            type: "Point",

            coordinates: [
              lon,
              lat,
            ],
          },

          $maxDistance:
            FIXED_RADIUS_KM * 1000,
        },
      },
    })
      .select(
        "_id fullName phone email profilePhoto currentLocation registrationLocation skills service skillLevel experienceYears experienceCategory averageRating totalRatings totalJobsCompleted"
      )
      .limit(MAX_CANDIDATES)
      .lean();

  if (!nearbyWorkers.length) {
    return [];
  }

  const matchedWorkers = [];

  // ----------------------------------------------------------
  // SCORE EACH WORKER
  // ----------------------------------------------------------

  for (const worker of nearbyWorkers) {

    const coordinates =
      worker.currentLocation?.coordinates;

    if (
      !Array.isArray(coordinates) ||
      coordinates.length !== 2
    ) {
      continue;
    }

    const [
      workerLon,
      workerLat,
    ] = coordinates.map(Number);

    if (
      !Number.isFinite(workerLat) ||
      !Number.isFinite(workerLon)
    ) {
      continue;
    }

    const distance =
      calculateDistanceKm(
        lat,
        lon,
        workerLat,
        workerLon
      );

    if (
      distance > FIXED_RADIUS_KM
    ) {
      continue;
    }

    // --------------------------------------------------------
    // FIND SERVICE SKILL
    // --------------------------------------------------------

    let selectedSkill = null;

    if (
      Array.isArray(worker.skills)
    ) {

      selectedSkill =
        worker.skills.find(
          (skill) =>
            normalizeService(
              skill.service
            ) === service
        );
    }

    // Legacy single-service support
    if (
      !selectedSkill &&
      normalizeService(
        worker.service
      ) === service
    ) {

      selectedSkill = {
        service,

        experienceYears:
          Number(
            worker.experienceYears || 0
          ),

        skillLevel:
          worker.skillLevel ||
          "BEGINNER",
      };
    }

    if (!selectedSkill) {
      continue;
    }

    // --------------------------------------------------------
    // SKILL SCORE
    // --------------------------------------------------------

    const skillScores = {
      BEGINNER: 50,
      INTERMEDIATE: 75,
      EXPERT: 100,
    };

    const skillScore =
      skillScores[
        String(
          selectedSkill.skillLevel ||
          "BEGINNER"
        ).toUpperCase()
      ] || 50;

    // --------------------------------------------------------
    // DISTANCE SCORE
    // --------------------------------------------------------

    const distanceScore =
      Math.max(
        0,
        100 -
          (distance /
            FIXED_RADIUS_KM) *
            100
      );

    // --------------------------------------------------------
    // RATING SCORE
    // --------------------------------------------------------

    const rating =
      Number(
        worker.averageRating || 0
      );

    const ratingScore =
      Math.min(
        Math.max(
          (rating / 5) * 100,
          0
        ),
        100
      );

    // --------------------------------------------------------
    // EXPERIENCE SCORE
    // --------------------------------------------------------

    const experience =
      Number(
        selectedSkill.experienceYears ??
        worker.experienceYears ??
        0
      );

    const experienceScore =
      Math.min(
        experience * 10,
        100
      );

    // --------------------------------------------------------
    // WORKLOAD SCORE
    // --------------------------------------------------------

    const workloadScore = 100;

    // --------------------------------------------------------
    // FINAL SCORE
    // --------------------------------------------------------

    const score =
      skillScore * 0.40 +
      distanceScore * 0.25 +
      ratingScore * 0.15 +
      experienceScore * 0.10 +
      workloadScore * 0.10;

    matchedWorkers.push({
      workerId: worker._id,

      name: worker.fullName,

      phone: worker.phone,

      email: worker.email,

      profilePhoto:
        worker.profilePhoto || null,

      distance:
        Number(
          distance.toFixed(2)
        ),

      skillLevel:
        selectedSkill.skillLevel ||
        "BEGINNER",

      rating,

      experienceYears:
        experience,

      score:
        Number(
          score.toFixed(2)
        ),
    });
  }

  // ----------------------------------------------------------
  // SORT
  // ----------------------------------------------------------

  matchedWorkers.sort(
    (a, b) =>
      b.score - a.score ||
      a.distance - b.distance
  );

  return matchedWorkers.slice(0, resultLimit);
};


// ============================================================
// SINGLE BEST WORKER
// ============================================================

export const findBestWorker = async (
  options
) => {

  const workers =
    await findBestWorkers({
      ...options,
      limit: 1,
    });

  return workers[0] || null;
};
