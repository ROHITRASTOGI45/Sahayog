import mongoose from "mongoose";
import crypto from "node:crypto";
import Job from "./job.model.js";
import Rating from "./rating.model.js";
import { Customer } from "../customers/customer.model.js";
import { Worker } from "../workers/worker.model.js";
import { findBestWorkers, calculateDistanceKm } from "../matching/worker-matching.service.js";
import { reverseGeocode } from "../location/location.service.js";
import { notifyWorkers, notifyWorkersRequestTaken } from "../notifications/notification-delivery.service.js";
import { getEligibleWorker } from "../workers/worker-eligibility.service.js";

const FIXED_RADIUS_KM = 10;
const SERVICES = ["Plumbing", "Electrical", "Carpentry", "Painting", "Cleaning"];
const PUBLIC_WORKER_PROJECTION = "fullName phone email profilePhoto averageRating totalRatings experienceYears totalJobsCompleted experienceCategory skills cooperativeId";

const normalizeService = (value) => {
  const input = String(value || "").trim().toLowerCase();
  return SERVICES.find((service) => service.toLowerCase() === input) || null;
};

const sanitizeAddress = (address) => {
  if (!address || typeof address !== "object") return { formatted: "Location unavailable" };
  return {
    formatted: address.formatted || "Location detected",
    area: address.area || null,
    city: address.city || null,
    state: address.state || null,
    country: address.country || null,
    pincode: address.pincode || null,
  };
};

const sanitizeWorker = (worker) => {
  if (!worker) return null;
  return {
    id: String(worker._id || worker.id),
    name: worker.fullName || worker.name || "Professional",
    phone: worker.phone || null,
    email: worker.email || null,
    profilePhoto: worker.profilePhoto || null,
    rating: Number(worker.averageRating ?? worker.rating ?? 0),
    totalRatings: Number(worker.totalRatings || 0),
    totalJobsCompleted: Number(worker.totalJobsCompleted || 0),
    experienceYears: Number(worker.experienceYears || 0),
    experienceCategory: worker.experienceCategory || "PENDING",
    skills: Array.isArray(worker.skills) ? worker.skills : [],
    cooperative: worker.cooperativeId && typeof worker.cooperativeId === "object"
      ? { id: String(worker.cooperativeId._id), name: worker.cooperativeId.name || null }
      : null,
  };
};

const sanitizeCustomer = (customer) => {
  if (!customer) return null;
  return {
    name: customer.fullname || customer.fullName || "Customer",
    phone: customer.phone || null,
    email: customer.email || null,
    address: customer.address || null,
  };
};

const serializeJobForCustomer = (job, rating = null) => ({
  id: String(job._id),
  service: job.service,
  description: job.description,
  status: job.status,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  location: sanitizeAddress(job.location?.address),
  assignedWorker: sanitizeWorker(job.assignedWorkerId),
  experiencePreference: job.experiencePreference,
  amount: Number(job.amount || 0),
  requestType: job.requestType || "MATCHED",
  preferredWorker: sanitizeWorker(job.preferredWorkerId),
  completion: {
    requestedAt: job.completion?.requestedAt || null,
    customerConfirmedAt: job.completion?.customerConfirmedAt || null,
    confirmedAt: job.completion?.confirmedAt || null,
  },
  rating: rating
    ? {
        id: String(rating._id),
        rating: rating.rating,
        review: rating.review || "",
        createdAt: rating.createdAt,
      }
    : null,
});

const serializeJobForWorker = (job, distanceKm = null, rating = null) => ({
  id: String(job._id),
  service: job.service,
  description: job.description,
  status: job.status,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  location: sanitizeAddress(job.location?.address),
  distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : null,
  customer: sanitizeCustomer(job.customerId),
  experiencePreference: job.experiencePreference,
  amount: Number(job.amount || 0),
  completion: {
    requestedAt: job.completion?.requestedAt || null,
    customerConfirmedAt: job.completion?.customerConfirmedAt || null,
    confirmedAt: job.completion?.confirmedAt || null,
  },
  rating: rating
    ? {
        rating: rating.rating,
        review: rating.review || "",
        createdAt: rating.createdAt,
      }
    : null,
});

const normalizeAddressInput = (value) => {
  if (!value || typeof value !== "object") return null;
  const formatted = String(value.formatted || "").trim();
  if (!formatted) return null;
  return sanitizeAddress({
    formatted,
    area: value.area,
    city: value.city,
    state: value.state,
    country: value.country,
    pincode: value.pincode,
  });
};

export const createJob = async (req, res) => {
  try {
    const customerId = req.customer?._id;
    const {
      service,
      description,
      latitude,
      longitude,
      locationAddress,
      experiencePreference,
      amount,
      preferredWorkerId,
    } = req.body || {};

    if (!customerId) return res.status(401).json({ success: false, message: "Customer authentication required" });

    const cleanService = normalizeService(service);
    const cleanDescription = String(description || "").trim();
    const lat = Number(latitude);
    const lon = Number(longitude);
    const directWorkerId = preferredWorkerId ? String(preferredWorkerId) : "";
    const isDirectRequest = Boolean(directWorkerId);
    const preference = String(experiencePreference || "ANY").trim().toUpperCase();
    const offerAmount = Number(amount);

    if (!cleanService) return res.status(400).json({ success: false, message: "Please select a valid service" });
    if (!isDirectRequest && !["ANY", "EXPERIENCED"].includes(preference)) {
      return res.status(400).json({ success: false, message: "Please select a valid worker experience preference" });
    }

    // Direct saved-professional requests use the existing ANY amount range.
    // Normal requests retain their original preference-dependent limits.
    const effectivePreference = isDirectRequest ? "ANY" : preference;
    const minAmount = effectivePreference === "EXPERIENCED" ? 599 : 499;
    const maxAmount = effectivePreference === "EXPERIENCED" ? 5999 : 4999;
    if (!Number.isInteger(offerAmount) || offerAmount < minAmount || offerAmount > maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Amount must be between ₹${minAmount} and ₹${maxAmount}.`,
      });
    }
    if (cleanDescription.length < 3 || cleanDescription.length > 2000) {
      return res.status(400).json({ success: false, message: "Description must be between 3 and 2000 characters" });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return res.status(400).json({ success: false, message: "Invalid location coordinates" });
    }

    let workers = [];

    if (isDirectRequest) {
      if (!mongoose.isValidObjectId(directWorkerId)) {
        return res.status(400).json({ success: false, message: "Invalid professional selected" });
      }

      const customer = await Customer.findById(customerId).select("savedProfessionals").lean();
      const isSaved = (customer?.savedProfessionals || []).some(
        (workerId) => String(workerId) === directWorkerId
      );
      if (!isSaved) {
        return res.status(403).json({
          success: false,
          message: "You can request only a professional saved to your account.",
        });
      }

      // This performs the authoritative availability + active cooperative check.
      const worker = await getEligibleWorker(directWorkerId, { requireAvailable: true });
      if (!worker || worker.isSuspended) {
        return res.status(409).json({
          success: false,
          code: "WORKER_UNAVAILABLE",
          message: "This professional is currently unavailable. Please try again later.",
        });
      }

      const workerServices = [
        ...(Array.isArray(worker.skills) ? worker.skills.map((skill) => normalizeService(skill.service)).filter(Boolean) : []),
        normalizeService(worker.service),
      ].filter(Boolean);
      if (!workerServices.includes(cleanService)) {
        return res.status(409).json({
          success: false,
          message: "This professional does not provide the selected service.",
        });
      }

      workers = [{
        workerId: worker._id,
        name: worker.fullName,
        distance: null,
        rating: Number(worker.averageRating || 0),
        experienceYears: Number(worker.experienceYears || 0),
        skillLevel: worker.skillLevel || "BEGINNER",
        experienceCategory: worker.experienceCategory || "ANY",
      }];
    } else {
      workers = await findBestWorkers({
        serviceName: cleanService,
        latitude: lat,
        longitude: lon,
        limit: 250,
        experiencePreference: effectivePreference,
      });
    }

    let address = normalizeAddressInput(locationAddress);
    if (!address) {
      try {
        address = await reverseGeocode(lat, lon);
      } catch (error) {
        console.warn("Job reverse geocoding fallback:", error.message);
        address = { formatted: "Location detected" };
      }
    }

    const job = await Job.create({
      customerId,
      service: cleanService,
      description: cleanDescription,
      experiencePreference: effectivePreference,
      amount: offerAmount,
      location: {
        type: "Point",
        coordinates: [lon, lat],
        address,
      },
      matchedWorkerIds: workers.map((worker) => worker.workerId),
      assignedWorkerId: null,
      requestType: isDirectRequest ? "DIRECT" : "MATCHED",
      preferredWorkerId: isDirectRequest ? workers[0].workerId : null,
      matching: {
        radiusKm: isDirectRequest ? 0 : FIXED_RADIUS_KM,
        workerCount: workers.length,
      },
      status: "REQUESTED",
    });

    let notifications = [];
    if (workers.length) {
      const distanceByWorker = new Map(
        workers.map((worker) => [String(worker.workerId), Number.isFinite(worker.distance) ? worker.distance : 0])
      );
      notifications = await notifyWorkers({
        workerIds: workers.map((worker) => worker.workerId),
        requestId: job._id,
        service: cleanService,
        description: cleanDescription,
        locationAddress: address,
        experiencePreference: effectivePreference,
        amount: offerAmount,
        distanceByWorker,
        directRequest: isDirectRequest,
        io: req.app.get("io"),
      });

      // A direct request must never remain as an undeliverable request when
      // the selected worker becomes unavailable between the availability
      // check and notification delivery. Never fall back to other workers.
      if (isDirectRequest && notifications[0]?.message === "Worker is no longer available") {
        await Job.deleteOne({ _id: job._id, status: "REQUESTED" });
        return res.status(409).json({
          success: false,
          code: "WORKER_UNAVAILABLE",
          message: "This professional is no longer available. Please try again later.",
        });
      }
    }

    return res.status(201).json({
      success: true,
      message: isDirectRequest
        ? `Request sent only to ${workers[0]?.name || "the selected professional"}.`
        : workers.length
          ? `Request sent to ${workers.length} nearby professionals`
          : "No available professionals are currently within 10 km for this service.",
      requestId: String(job._id),
      job: serializeJobForCustomer(job.toObject()),
      workerCount: workers.length,
      directRequest: isDirectRequest,
      matchedWorkers: workers.map((worker) => ({
        name: worker.name,
        distanceKm: worker.distance,
        rating: worker.rating,
        experienceYears: worker.experienceYears,
        skillLevel: worker.skillLevel,
        experienceCategory: worker.experienceCategory,
      })),
      notifications: notifications.map(({ workerId, notificationId, success, fcm, socket }) => ({ workerId, notificationId, success, fcm, socket })),
    });
  } catch (error) {
    console.error("Create job error:", error);
    return res.status(500).json({ success: false, message: "Unable to send your request. Please try again." });
  }
};

export const listCustomerJobs = async (req, res) => {
  try {
    // Request history is authoritative: return every request belonging to
    // the authenticated customer. Do not limit, collapse, or replace the
    // collection with the latest request. Each Job document represents one
    // independent customer request, including multiple requests for the same
    // service.
    const jobs = await Job.find({ customerId: req.customer._id })
      .sort({ createdAt: -1, _id: -1 })
      .populate("assignedWorkerId", PUBLIC_WORKER_PROJECTION)
      .populate("assignedWorkerId.cooperativeId", "name")
      .populate("preferredWorkerId", PUBLIC_WORKER_PROJECTION)
      .populate("preferredWorkerId.cooperativeId", "name")
      .lean();

    const jobIds = jobs.map((job) => job._id);
    const ratings = await Rating.find({ jobId: { $in: jobIds } })
      .select("_id jobId rating review createdAt")
      .lean();
    const ratingByJob = new Map(ratings.map((rating) => [String(rating.jobId), rating]));

    return res.json({
      success: true,
      jobs: jobs.map((job) => serializeJobForCustomer(job, ratingByJob.get(String(job._id)) || null)),
    });
  } catch (error) {
    console.error("List customer jobs error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch service requests" });
  }
};

export const listWorkerRequests = async (req, res) => {
  try {
    const worker = await getEligibleWorker(req.worker?._id);

    // New service requests are visible only to workers who are currently
    // eligible: active + available + member of an ACTIVE cooperative.
    if (!worker) {
      return res.json({ success: true, jobs: [] });
    }

    const workerCoordinates = worker?.location?.coordinates;
    const jobs = await Job.find({ status: "REQUESTED", matchedWorkerIds: worker._id, assignedWorkerId: null })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("customerId", "fullname phone email address")
      .lean();

    const [workerLon, workerLat] = Array.isArray(workerCoordinates) ? workerCoordinates.map(Number) : [NaN, NaN];
    const serialized = jobs.map((job) => {
      const coords = job.location?.coordinates;
      const [jobLon, jobLat] = Array.isArray(coords) ? coords.map(Number) : [NaN, NaN];
      const distance = [workerLat, workerLon, jobLat, jobLon].every(Number.isFinite)
        ? calculateDistanceKm(workerLat, workerLon, jobLat, jobLon)
        : null;
      return serializeJobForWorker(job, distance);
    });

    return res.json({ success: true, jobs: serialized });
  } catch (error) {
    console.error("List worker requests error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch service requests" });
  }
};

export const listWorkerActiveJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ assignedWorkerId: req.worker._id, status: { $in: ["ASSIGNED", "IN_PROGRESS", "WORK_COMPLETION_REQUESTED", "CUSTOMER_DISPUTED"] } })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("customerId", "fullname phone email address")
      .lean();

    const workerCoordinates = req.worker.currentLocation?.coordinates;
    const [workerLon, workerLat] = Array.isArray(workerCoordinates) ? workerCoordinates.map(Number) : [NaN, NaN];
    return res.json({
      success: true,
      jobs: jobs.map((job) => {
        const coords = job.location?.coordinates;
        const [jobLon, jobLat] = Array.isArray(coords) ? coords.map(Number) : [NaN, NaN];
        const distance = [workerLat, workerLon, jobLat, jobLon].every(Number.isFinite)
          ? calculateDistanceKm(workerLat, workerLon, jobLat, jobLon)
          : null;
        return serializeJobForWorker(job, distance);
      }),
    });
  } catch (error) {
    console.error("List worker active jobs error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch active assignments" });
  }
};

export const acceptJob = async (req, res) => {
  try {
    const workerId = req.worker?._id;
    const jobId = req.params.id;
    if (!workerId || !mongoose.isValidObjectId(jobId)) return res.status(400).json({ success: false, message: "Invalid request" });

    const workerRecord = await getEligibleWorker(workerId);
    if (!workerRecord) {
      return res.status(403).json({
        success: false,
        message: "You must be an available member of an approved active cooperative before accepting service requests.",
      });
    }

    const reservedWorker = await Worker.findOneAndUpdate(
      { _id: workerId, isActive: true, isSuspended: { $ne: true }, status: "AVAILABLE", cooperativeId: workerRecord.cooperativeId },
      { $set: { status: "BUSY" } },
      { new: true }
    ).select(PUBLIC_WORKER_PROJECTION);

    if (!reservedWorker) return res.status(409).json({ success: false, message: "You are no longer available to accept this request" });

    const job = await Job.findOneAndUpdate(
      { _id: jobId, status: "REQUESTED", assignedWorkerId: null, matchedWorkerIds: workerId },
      { $set: { assignedWorkerId: workerId, status: "ASSIGNED" } },
      { new: true }
    )
      .populate("customerId", "fullname phone email address")
       .populate("assignedWorkerId", PUBLIC_WORKER_PROJECTION)
      .populate("assignedWorkerId.cooperativeId", "name")
      .lean();

    if (!job) {
      await Worker.updateOne({ _id: workerId, status: "BUSY" }, [{ $set: { status: { $cond: [{ $eq: ["$isSuspended", true] }, "SUSPENDED", "AVAILABLE"] } } }]);
      return res.status(409).json({ success: false, message: "This request has already been accepted by another worker" });
    }

    const worker = sanitizeWorker(job.assignedWorkerId);
    const customer = sanitizeCustomer(job.customerId);
    const customerRoom = `customer:${job.customerId._id}`;
    const otherWorkerIds = (job.matchedWorkerIds || []).filter((id) => String(id) !== String(workerId));
    const io = req.app.get("io");

    if (io) {
      io.to(customerRoom).emit("worker-accepted", {
        requestId: String(job._id),
        worker,
        service: job.service,
        location: sanitizeAddress(job.location?.address),
      });
      await notifyWorkersRequestTaken({ workerIds: otherWorkerIds, requestId: job._id, io });
    }

    return res.json({
      success: true,
      message: "Request accepted successfully",
      job: serializeJobForWorker(job, null),
      worker,
      customer,
    });
  } catch (error) {
    console.error("Accept job error:", error);
    return res.status(500).json({ success: false, message: "Failed to accept request" });
  }
};

export const rejectJob = async (req, res) => {
  try {
    const workerId = req.worker?._id;
    const jobId = req.params.id;
    if (!workerId || !mongoose.isValidObjectId(jobId)) return res.status(400).json({ success: false, message: "Invalid request" });

    const existingJob = await Job.findOne({
      _id: jobId,
      status: "REQUESTED",
      assignedWorkerId: null,
      matchedWorkerIds: workerId,
    }).select("requestType customerId").lean();

    if (!existingJob) {
      return res.status(409).json({ success: false, message: "This request is no longer available" });
    }

    if (existingJob.requestType === "DIRECT") {
      const cancelled = await Job.findOneAndUpdate(
        { _id: jobId, status: "REQUESTED", assignedWorkerId: null, matchedWorkerIds: workerId },
        { $set: { status: "CANCELLED" }, $pull: { matchedWorkerIds: workerId } },
        { new: true }
      ).lean();

      if (!cancelled) {
        return res.status(409).json({ success: false, message: "This request is no longer available" });
      }

      const io = req.app.get("io");
      if (io) {
        io.to(`customer:${existingJob.customerId}`).emit("request-cancelled", {
          requestId: String(jobId),
          message: "The selected professional declined your direct request.",
        });
      }

      return res.json({ success: true, message: "Direct request rejected" });
    }

    const result = await Job.updateOne(
      { _id: jobId, status: "REQUESTED", assignedWorkerId: null, matchedWorkerIds: workerId },
      { $pull: { matchedWorkerIds: workerId } }
    );
    if (!result.modifiedCount) return res.status(409).json({ success: false, message: "This request is no longer available" });
    return res.json({ success: true, message: "Request rejected" });
  } catch (error) {
    console.error("Reject job error:", error);
    return res.status(500).json({ success: false, message: "Failed to reject request" });
  }
};

export const cancelJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job id",
      });
    }

    const job = await Job.findOneAndUpdate(
      {
        _id: id,
        customerId: req.customer._id,
        status: { $in: ["REQUESTED", "ASSIGNED"] },
      },
      { $set: { status: "CANCELLED" } },
      { new: true }
    )
       .populate("assignedWorkerId", PUBLIC_WORKER_PROJECTION)
      .populate("assignedWorkerId.cooperativeId", "name")
      .lean();

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Cancellable request not found",
      });
    }

    // If a worker had already accepted the request, release that worker.
    if (job.assignedWorkerId?._id) {
      await Worker.updateOne(
        {
          _id: job.assignedWorkerId._id,
          status: "BUSY",
        },
        [{ $set: { status: { $cond: [{ $eq: ["$isSuspended", true] }, "SUSPENDED", "AVAILABLE"] } } }]
      );
    }

    const io = req.app.get("io");

    if (io) {
      const matchedWorkerIds = new Set(
        (job.matchedWorkerIds || []).map((workerId) => String(workerId))
      );

      if (job.assignedWorkerId?._id) {
        matchedWorkerIds.add(String(job.assignedWorkerId._id));
      }

      for (const workerId of matchedWorkerIds) {
        io.to(`worker:${workerId}`).emit("request-cancelled", {
          requestId: String(job._id),
          message: "The customer cancelled this request.",
        });
      }

      io.to(`customer:${req.customer._id}`).emit("request-cancelled", {
        requestId: String(job._id),
        message: "Service request cancelled.",
      });
    }

    return res.json({
      success: true,
      message: "Service request cancelled",
      job: serializeJobForCustomer(job),
    });
  } catch (error) {
    console.error("Cancel job error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to cancel request",
    });
  }
};


const hashCompletionOtp = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

const generateCompletionOtp = () =>
  String(crypto.randomInt(1000, 10000));

export const startJob = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid job id" });
    }

    const job = await Job.findOneAndUpdate(
      { _id: id, assignedWorkerId: req.worker._id, status: "ASSIGNED" },
      { $set: { status: "IN_PROGRESS" } },
      { new: true }
    )
      .populate("customerId", "fullname phone email address")
       .populate("assignedWorkerId", PUBLIC_WORKER_PROJECTION)
      .populate("assignedWorkerId.cooperativeId", "name")
      .lean();

    if (!job) {
      return res.status(409).json({
        success: false,
        message: "This assignment is no longer available to start.",
      });
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`customer:${job.customerId._id}`).emit("job-status-updated", {
        requestId: String(job._id),
        status: "IN_PROGRESS",
        worker: sanitizeWorker(job.assignedWorkerId),
      });
    }

    return res.json({
      success: true,
      message: "Service started.",
      job: serializeJobForWorker(job),
    });
  } catch (error) {
    console.error("Start job error:", error);
    return res.status(500).json({ success: false, message: "Unable to start this service." });
  }
};

export const requestJobCompletion = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid job id" });
    }

    const job = await Job.findOneAndUpdate(
      { _id: id, assignedWorkerId: req.worker._id, status: "IN_PROGRESS" },
      {
        $set: {
          status: "WORK_COMPLETION_REQUESTED",
          "completion.requestedAt": new Date(),
          "completion.requestedBy": req.worker._id,
          "completion.customerConfirmedAt": null,
          "completion.customerConfirmedBy": null,
          "completion.otpHash": null,
          "completion.otpExpiresAt": null,
        },
      },
      { new: true }
    )
      .populate("customerId", "fullname phone email address")
       .populate("assignedWorkerId", PUBLIC_WORKER_PROJECTION)
      .populate("assignedWorkerId.cooperativeId", "name")
      .lean();

    if (!job) {
      return res.status(409).json({
        success: false,
        message: "This service is not currently in progress or has already moved to another state.",
      });
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`customer:${job.customerId._id}`).emit("job-completion-requested", {
        requestId: String(job._id),
        service: job.service,
        worker: sanitizeWorker(job.assignedWorkerId),
        requestedAt: job.completion?.requestedAt || new Date(),
      });
    }

    return res.json({
      success: true,
      message: "Completion request sent to the customer.",
      job: serializeJobForWorker(job),
    });
  } catch (error) {
    console.error("Request completion error:", error);
    return res.status(500).json({ success: false, message: "Unable to request completion." });
  }
};

export const confirmJobCompletion = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid job id" });
    }

    const job = await Job.findOne({
      _id: id,
      customerId: req.customer._id,
      status: "WORK_COMPLETION_REQUESTED",
    }).populate("assignedWorkerId", PUBLIC_WORKER_PROJECTION);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Completion confirmation is not available for this request.",
      });
    }

    const otp = generateCompletionOtp();
    const otpExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    job.completion.customerConfirmedAt = new Date();
    job.completion.customerConfirmedBy = req.customer._id;
    job.completion.otpHash = hashCompletionOtp(otp);
    job.completion.otpExpiresAt = otpExpiresAt;
    await job.save();

    const io = req.app.get("io");
    if (io && job.assignedWorkerId?._id) {
      io.to(`worker:${job.assignedWorkerId._id}`).emit("customer-confirmed-completion", {
        requestId: String(job._id),
        message: "The customer confirmed that the service is ready for completion verification.",
      });
    }

    return res.json({
      success: true,
      message: "Completion confirmed. Give this verification code to the professional.",
      requestId: String(job._id),
      otp,
      expiresAt: otpExpiresAt,
    });
  } catch (error) {
    console.error("Confirm completion error:", error);
    return res.status(500).json({ success: false, message: "Unable to confirm completion." });
  }
};

export const disputeJobCompletion = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason || "").trim();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid job id" });
    }
    if (reason.length < 3 || reason.length > 1000) {
      return res.status(400).json({ success: false, message: "Please provide a problem description between 3 and 1000 characters." });
    }

    const job = await Job.findOneAndUpdate(
      { _id: id, customerId: req.customer._id, status: "WORK_COMPLETION_REQUESTED" },
      {
        $set: {
          status: "CUSTOMER_DISPUTED",
          "dispute.reason": reason,
          "dispute.createdAt": new Date(),
          "dispute.createdBy": req.customer._id,
          "completion.otpHash": null,
          "completion.otpExpiresAt": null,
        },
      },
      { new: true }
    )
       .populate("assignedWorkerId", PUBLIC_WORKER_PROJECTION)
      .populate("assignedWorkerId.cooperativeId", "name")
      .lean();

    if (!job) {
      return res.status(409).json({ success: false, message: "This completion request can no longer be disputed." });
    }

    const io = req.app.get("io");
    if (io && job.assignedWorkerId?._id) {
      io.to(`worker:${job.assignedWorkerId._id}`).emit("completion-disputed", {
        requestId: String(job._id),
        message: "The customer reported a problem with the service completion.",
        reason,
      });
    }

    return res.json({
      success: true,
      message: "Problem reported. The service will not be marked completed.",
      job: serializeJobForCustomer(job),
    });
  } catch (error) {
    console.error("Dispute completion error:", error);
    return res.status(500).json({ success: false, message: "Unable to report the problem." });
  }
};

export const verifyJobCompletion = async (req, res) => {
  try {
    const { id } = req.params;
    const otp = String(req.body?.otp || "").trim();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid job id",
      });
    }

    if (!/^\d{4}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Enter the 4-digit completion code.",
      });
    }

    const job = await Job.findOne({
      _id: id,
      assignedWorkerId: req.worker._id,
      status: "WORK_COMPLETION_REQUESTED",
    }).select("+completion.otpHash");

    if (!job) {
      return res.status(404).json({
        success: false,
        message:
          "Completion verification is not available for this assignment.",
      });
    }

    if (!job.completion?.customerConfirmedAt || !job.completion?.otpHash) {
      return res.status(409).json({
        success: false,
        message: "The customer has not confirmed completion yet.",
      });
    }

    if (
      !job.completion.otpExpiresAt ||
      job.completion.otpExpiresAt.getTime() < Date.now()
    ) {
      return res.status(410).json({
        success: false,
        message:
          "The completion code has expired. Ask the customer to generate a new code.",
      });
    }

    if (hashCompletionOtp(otp) !== job.completion.otpHash) {
      return res.status(401).json({
        success: false,
        message: "Invalid completion code.",
      });
    }

    const now = new Date();

    const completedJob = await Job.findOneAndUpdate(
      {
        _id: id,
        assignedWorkerId: req.worker._id,
        status: "WORK_COMPLETION_REQUESTED",
        "completion.otpHash": job.completion.otpHash,
      },
      {
        $set: {
          status: "COMPLETED",
          "completion.confirmedAt": now,
          "completion.confirmedBy": req.worker._id,
          "completion.confirmationMethod": "OTP",
          "completion.otpHash": null,
          "completion.otpExpiresAt": null,
        },
      },
      { new: true }
    )
      .populate("customerId", "fullname phone email address")
      .populate("assignedWorkerId", PUBLIC_WORKER_PROJECTION)
      .populate("assignedWorkerId.cooperativeId", "name")
      .lean();

    if (!completedJob) {
      return res.status(409).json({
        success: false,
        message: "This service was already completed or changed state.",
      });
    }

    // Get the worker's current suspension state.
    const workerRecord = await Worker.findById(req.worker._id)
      .select("isSuspended")
      .lean();

    if (!workerRecord) {
      return res.status(404).json({
        success: false,
        message: "Worker record not found.",
      });
    }

    // Update worker statistics and automatically make the worker available.
    // No MongoDB update pipeline is used here.
    await Worker.updateOne(
      { _id: req.worker._id },
      {
        $inc: {
          totalJobsCompleted: 1,
        },
        $set: {
          status: workerRecord.isSuspended ? "SUSPENDED" : "AVAILABLE",
        },
      }
    );

    const io = req.app.get("io");

    if (io) {
      io.to(`customer:${completedJob.customerId._id}`).emit(
        "job-status-updated",
        {
          requestId: String(completedJob._id),
          status: "COMPLETED",
          worker: sanitizeWorker(completedJob.assignedWorkerId),
        }
      );

      io.to(`worker:${req.worker._id}`).emit("job-status-updated", {
        requestId: String(completedJob._id),
        status: "COMPLETED",
      });
    }

    return res.json({
      success: true,
      message: "Service completed and verified successfully.",
      job: serializeJobForWorker(completedJob),
    });
  } catch (error) {
    console.error("Verify completion error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify service completion.",
    });
  }
};

export const createJobRating = async (req, res) => {
  try {
    const { id } = req.params;
    const ratingValue = Number(req.body?.rating);
    const review = String(req.body?.review || "").trim();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: "Invalid job id" });
    }
    if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 5) {
      return res.status(400).json({ success: false, message: "Rating must be a whole number from 1 to 5." });
    }
    if (review.length > 1000) {
      return res.status(400).json({ success: false, message: "Review must be 1000 characters or fewer." });
    }

    const job = await Job.findOne({
      _id: id,
      customerId: req.customer._id,
      status: "COMPLETED",
      assignedWorkerId: { $ne: null },
    }).select("customerId assignedWorkerId service status").lean();

    if (!job) {
      return res.status(409).json({ success: false, message: "Only a completed service can be rated." });
    }

    const existing = await Rating.findOne({ jobId: job._id }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: "You have already rated this service." });
    }

    let created;
    try {
      created = await Rating.create({
        jobId: job._id,
        customerId: req.customer._id,
        workerId: job.assignedWorkerId,
        rating: ratingValue,
        review,
      });
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ success: false, message: "You have already rated this service." });
      }
      throw error;
    }

    const stats = await Rating.aggregate([
      { $match: { workerId: new mongoose.Types.ObjectId(String(job.assignedWorkerId)) } },
      {
        $group: {
          _id: "$workerId",
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    const workerStats = stats[0] || { averageRating: 0, totalRatings: 0 };
    await Worker.updateOne(
      { _id: job.assignedWorkerId },
      {
        $set: {
          averageRating: Number(Number(workerStats.averageRating || 0).toFixed(2)),
          totalRatings: workerStats.totalRatings,
        },
      }
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`worker:${job.assignedWorkerId}`).emit("new-rating-received", {
        jobId: String(job._id),
        rating: created.rating,
        review: created.review || "",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Thank you for rating the professional.",
      rating: {
        id: String(created._id),
        rating: created.rating,
        review: created.review || "",
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    console.error("Create rating error:", error);
    return res.status(500).json({ success: false, message: "Unable to submit your rating." });
  }
};

export const listWorkerCompletedJobs = async (req, res) => {
  try {
    const jobs = await Job.find({
      assignedWorkerId: req.worker._id,
      status: "COMPLETED",
    })
      .sort({ "completion.confirmedAt": -1, updatedAt: -1 })
      .populate("customerId", "fullname phone email address")
      .lean();

    const ratings = await Rating.find({ workerId: req.worker._id, jobId: { $in: jobs.map((job) => job._id) } })
      .select("jobId rating review createdAt")
      .lean();
    const ratingByJob = new Map(ratings.map((rating) => [String(rating.jobId), rating]));

    return res.json({
      success: true,
      jobs: jobs.map((job) => serializeJobForWorker(job, null, ratingByJob.get(String(job._id)) || null)),
    });
  } catch (error) {
    console.error("List all worker completed jobs error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch completed jobs." });
  }
};

export const listWorkerHistory = async (req, res) => {
  try {
    const jobs = await Job.find({
      assignedWorkerId: req.worker._id,
      status: "COMPLETED",
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .populate("customerId", "fullname phone email address")
      .lean();

    const ratings = await Rating.find({ workerId: req.worker._id, jobId: { $in: jobs.map((job) => job._id) } })
      .select("jobId rating review createdAt")
      .lean();
    const ratingByJob = new Map(ratings.map((rating) => [String(rating.jobId), rating]));

    return res.json({
      success: true,
      jobs: jobs.map((job) => serializeJobForWorker(job, null, ratingByJob.get(String(job._id)) || null)),
    });
  } catch (error) {
    console.error("List worker history error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch completed services." });
  }
};
export const listWorkerCancelledJobs = async (req, res) => {
  try {
    const jobs = await Job.find({ assignedWorkerId: req.worker._id, status: "CANCELLED" })
      .sort({ updatedAt: -1 })
      .populate("customerId", "fullname phone email address")
      .lean();
    return res.json({ success: true, jobs: jobs.map((job) => serializeJobForWorker(job)) });
  } catch (error) {
    console.error("List worker cancelled jobs error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch cancelled jobs." });
  }
};

