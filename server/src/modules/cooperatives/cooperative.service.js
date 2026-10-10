import mongoose from "mongoose";
import Cooperative from "./cooperative.model.js";
import { Worker } from "../workers/worker.model.js";
import Job from "../jobs/job.model.js";
import { CooperativeJoinRequest } from "./cooperative-join-request.model.js";
import { apiError } from "../../shared/utils/api-error.js";
import { isValidEmail, isValidIndianPhone, isValidIndianPincode } from "../../shared/utils/validation.js";

const SAFE_WORKER_FIELDS = "fullName email phone address registrationLocation currentLocation profilePhoto cooperativeId status isSuspended skills service skillLevel experienceYears experienceCategory totalJobsCompleted averageRating totalRatings isActive createdAt updatedAt";
const ALLOWED_STATUSES = ["AVAILABLE", "BUSY", "OFFLINE", "SUSPENDED"];

const validateCooperativePayload = ({ name, registrationNumber, email, phone, address, location }) => {
  if (!name?.trim() || !registrationNumber?.trim() || !email?.trim() || !phone?.trim()) {
    throw new apiError(400, "Name, registration number, email and phone are required!");
  }
  if (name.trim().length < 2 || name.trim().length > 150) throw new apiError(400, "Cooperative name must be between 2 and 150 characters!");
  const normalizedEmail = email.trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) throw new apiError(400, "Invalid email format!");
  const normalizedPhone = phone.trim();
  if (!isValidIndianPhone(normalizedPhone)) throw new apiError(400, "Invalid Indian mobile number.");
  if (address?.pincode && !isValidIndianPincode(String(address.pincode).trim())) throw new apiError(400, "Invalid Indian pincode.");
  if (!Array.isArray(location?.coordinates) || location.coordinates.length !== 2) throw new apiError(400, "Cooperative location coordinates are required.");
  const [lon, lat] = location.coordinates.map(Number);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new apiError(400, "Invalid cooperative location coordinates.");
  return { normalizedEmail, normalizedPhone, normalizedRegistrationNumber: registrationNumber.trim(), coordinates: [lon, lat] };
};

export const registerCooperative = async (payload) => {
  const { normalizedEmail, normalizedPhone, normalizedRegistrationNumber, coordinates } = validateCooperativePayload(payload);
  const existing = await Cooperative.findOne({ $or: [{ email: normalizedEmail }, { "contact.email": normalizedEmail }, { phone: normalizedPhone }, { "contact.phone": normalizedPhone }, { registrationNumber: normalizedRegistrationNumber }] }).select("name registrationNumber contact email phone").lean();
  if (existing) throw new apiError(409, "A cooperative with the same registration details already exists!");

  const cooperative = await Cooperative.create({
    name: payload.name.trim(),
    registrationNumber: normalizedRegistrationNumber,
    type: payload.type || "LABOUR_COOPERATIVE",
    description: payload.description?.trim() || null,
    contact: { phone: normalizedPhone, email: normalizedEmail },
    address: payload.address || {},
    location: { type: "Point", coordinates },
    // New cooperatives must be verified by the System Admin before they can log in
    // or appear in the worker cooperative directory.
    status: "PENDING",
    isActive: false,
    maxWorkers: Math.max(Number(payload.maxWorkers) || 50, 1),
  });
  return Cooperative.findById(cooperative._id).lean();
};

const distanceKm = (lat1, lon1, lat2, lon2) => {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const getCooperatives = async (registrationLatitude = null, registrationLongitude = null) => {
  const cooperatives = await Cooperative.find({ isActive: true, status: "ACTIVE" })
    .select("name registrationNumber type description contact address location services serviceCategories totalWorkers maxWorkers activeWorkers averageRating")
    .sort({ name: 1 })
    .lean();

  const lat = Number(registrationLatitude);
  const lon = Number(registrationLongitude);
  const hasRegistrationLocation =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 &&
    lon >= -180 && lon <= 180;

  const result = cooperatives.map((cooperative) => {
    const coordinates = cooperative.location?.coordinates;
    const cooperativeLon = Number(coordinates?.[0]);
    const cooperativeLat = Number(coordinates?.[1]);
    const distance = hasRegistrationLocation && Number.isFinite(cooperativeLat) && Number.isFinite(cooperativeLon)
      ? distanceKm(lat, lon, cooperativeLat, cooperativeLon)
      : null;

    return {
      ...cooperative,
      distanceKm: distance === null ? null : Number(distance.toFixed(2)),
      availableSlots: Math.max((cooperative.maxWorkers || 0) - (cooperative.totalWorkers || 0), 0),
    };
  });

  if (hasRegistrationLocation) {
    result.sort((a, b) => {
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }

  return result;
};

export const requestToJoin = async (workerId, cooperativeId, message) => {
  if (!mongoose.isValidObjectId(cooperativeId)) throw new apiError(400, "Invalid cooperative id!");
  const worker = await Worker.findById(workerId).select("_id cooperativeId isActive");
  if (!worker) throw new apiError(404, "Worker not found!");
  if (!worker.isActive) throw new apiError(403, "Worker account is inactive!");
  if (worker.cooperativeId) throw new apiError(400, "You are already assigned to a cooperative!");

  const cooperative = await Cooperative.findOne({ _id: cooperativeId, isActive: true, status: "ACTIVE" }).select("_id totalWorkers maxWorkers");
  if (!cooperative) throw new apiError(404, "Cooperative not found or inactive!");
  if (cooperative.totalWorkers >= cooperative.maxWorkers) throw new apiError(400, "This cooperative currently has no available positions!");

  try {
    const request = await CooperativeJoinRequest.create({ workerId, cooperativeId, message: message?.trim() || null });
    return await CooperativeJoinRequest.findById(request._id)
      .populate("workerId", SAFE_WORKER_FIELDS)
      .populate("cooperativeId", "name registrationNumber type status maxWorkers totalWorkers")
      .lean();
  } catch (error) {
    if (error?.code === 11000) throw new apiError(409, "You already have a pending request for this cooperative!");
    throw error;
  }
};

export const getWorkerPendingJoinRequests = async (workerId) => {
  return CooperativeJoinRequest.find({
    workerId,
    status: "PENDING",
  })
    .select("_id workerId cooperativeId message status createdAt")
    .populate("cooperativeId", "name registrationNumber type status maxWorkers totalWorkers")
    .sort({ createdAt: -1 })
    .lean();
};

export const getDashboard = async (cooperativeId) => {
  const cooperative = await Cooperative.findById(cooperativeId).select("name registrationNumber type description contact address location services serviceCategories emergencyServiceEnabled status totalWorkers maxWorkers activeWorkers verifiedWorkers totalJobsCompleted averageRating welfareFund demandForecastEnabled isActive createdAt updatedAt").lean();
  if (!cooperative) throw new apiError(404, "Cooperative not found!");

  const objectId = new mongoose.Types.ObjectId(cooperativeId);
  const workerIds = await Worker.find({ cooperativeId: objectId, isActive: true }).distinct("_id");
  const [workerStats, pendingJoinRequests, activeRequests, completedJobs] = await Promise.all([
    Worker.aggregate([
      { $match: { cooperativeId: objectId, isActive: true } },
      { $group: {
        _id: null,
        totalWorkers: { $sum: 1 },
        availableWorkers: { $sum: { $cond: [{ $eq: ["$status", "AVAILABLE"] }, 1, 0] } },
        busyWorkers: { $sum: { $cond: [{ $eq: ["$status", "BUSY"] }, 1, 0] } },
        offlineWorkers: { $sum: { $cond: [{ $eq: ["$status", "OFFLINE"] }, 1, 0] } },
        suspendedWorkers: { $sum: { $cond: [{ $or: [{ $eq: ["$status", "SUSPENDED"] }, { $eq: ["$isSuspended", true] }] }, 1, 0] } },
        totalJobsCompleted: { $sum: "$totalJobsCompleted" },
        ratingWeightedSum: { $sum: { $multiply: ["$averageRating", "$totalRatings"] } },
        ratingCount: { $sum: "$totalRatings" },
      } },
    ]),
    CooperativeJoinRequest.countDocuments({ cooperativeId: objectId, status: "PENDING" }),
    Job.countDocuments({ assignedWorkerId: { $in: workerIds }, status: { $in: ["ASSIGNED", "IN_PROGRESS", "WORK_COMPLETION_REQUESTED"] } }),
    Job.countDocuments({ assignedWorkerId: { $in: workerIds }, status: "COMPLETED" }),
  ]);

  const stats = workerStats[0] || { totalWorkers: 0, availableWorkers: 0, busyWorkers: 0, offlineWorkers: 0, suspendedWorkers: 0, totalJobsCompleted: 0, ratingWeightedSum: 0, ratingCount: 0 };
  const averageRating = stats.ratingCount ? Number((stats.ratingWeightedSum / stats.ratingCount).toFixed(2)) : 0;
  await Cooperative.updateOne({ _id: objectId }, { $set: { totalWorkers: stats.totalWorkers, activeWorkers: stats.availableWorkers + stats.busyWorkers, totalJobsCompleted: stats.totalJobsCompleted, averageRating } });

  return {
    cooperative: { ...cooperative, totalWorkers: stats.totalWorkers, activeWorkers: stats.availableWorkers + stats.busyWorkers, totalJobsCompleted: stats.totalJobsCompleted, averageRating },
    stats: {
      totalWorkers: stats.totalWorkers,
      availableWorkers: stats.availableWorkers,
      busyWorkers: stats.busyWorkers,
      offlineWorkers: stats.offlineWorkers,
      suspendedWorkers: stats.suspendedWorkers,
      activeWorkers: stats.availableWorkers + stats.busyWorkers,
      pendingJoinRequests,
      activeRequests,
      completedJobs,
      totalJobsCompleted: stats.totalJobsCompleted,
      averageRating,
      availableSlots: Math.max((cooperative.maxWorkers || 0) - stats.totalWorkers, 0),
    },
  };
};

export const getWorkers = async (cooperativeId) => {
  const cooperative = await Cooperative.findById(cooperativeId).select("name registrationNumber status maxWorkers totalWorkers").lean();
  if (!cooperative) throw new apiError(404, "Cooperative not found!");
  const workers = await Worker.find({ cooperativeId, isActive: true }).select(SAFE_WORKER_FIELDS).sort({ createdAt: -1 }).lean();
  return { cooperative, workers };
};

export const getWorker = async (cooperativeId, workerId) => {
  if (!mongoose.isValidObjectId(workerId)) throw new apiError(400, "Invalid worker id!");
  const worker = await Worker.findOne({ _id: workerId, cooperativeId }).select(SAFE_WORKER_FIELDS).lean();
  if (!worker) throw new apiError(404, "Worker not found in your cooperative!");
  return worker;
};

export const updateWorkerStatus = async (cooperativeId, workerId, status) => {
  const requested = String(status || "").toUpperCase();
  if (!["SUSPENDED", "RESTORE"].includes(requested)) {
    throw new apiError(400, "Cooperative admins can only suspend or restore workers. Operational status is managed automatically.");
  }
  const update = requested === "SUSPENDED"
    ? { $set: { isSuspended: true, status: "SUSPENDED" } }
    : { $set: { isSuspended: false, status: "OFFLINE" } };
  const worker = await Worker.findOneAndUpdate({ _id: workerId, cooperativeId, isActive: true }, update, { new: true, runValidators: true }).select(SAFE_WORKER_FIELDS).lean();
  if (!worker) throw new apiError(404, "Worker not found in your cooperative!");
  return worker;
};

export const updateWorkerExperienceCategory = async (cooperativeId, workerId, experienceCategory) => {
  const allowed = ["ANY", "EXPERIENCED"];
  if (!allowed.includes(experienceCategory)) throw new apiError(400, "Experience category must be ANY or EXPERIENCED.");
  const worker = await Worker.findOneAndUpdate(
    { _id: workerId, cooperativeId, isActive: true },
    { $set: { experienceCategory } },
    { new: true, runValidators: true }
  ).select(SAFE_WORKER_FIELDS).lean();
  if (!worker) throw new apiError(404, "Worker not found in your cooperative!");
  return worker;
};

export const acceptJoinRequest = async (requestId, adminId, cooperativeId) => {
  const request = await CooperativeJoinRequest.findOne({ _id: requestId, cooperativeId, status: "PENDING" });
  if (!request) throw new apiError(404, "Pending join request not found in your cooperative!");
  const cooperative = await Cooperative.findOne({ _id: cooperativeId, isActive: true, status: "ACTIVE" }).select("_id totalWorkers maxWorkers");
  if (!cooperative) throw new apiError(404, "Cooperative not found or inactive!");
  if (cooperative.totalWorkers >= cooperative.maxWorkers) throw new apiError(409, "This cooperative has reached its maximum worker capacity!");

  const worker = await Worker.findOneAndUpdate({ _id: request.workerId, isActive: true, cooperativeId: null }, { $set: { cooperativeId } }, { new: true, runValidators: true }).select(SAFE_WORKER_FIELDS);
  if (!worker) throw new apiError(409, "Worker is no longer available for cooperative assignment!");

  const counter = await Cooperative.findOneAndUpdate({ _id: cooperativeId, isActive: true, status: "ACTIVE", $expr: { $lt: ["$totalWorkers", "$maxWorkers"] } }, { $inc: { totalWorkers: 1 } }, { new: true });
  if (!counter) {
    await Worker.updateOne({ _id: worker._id, cooperativeId }, { $set: { cooperativeId: null } });
    throw new apiError(409, "This cooperative has reached its maximum worker capacity!");
  }

  const updatedRequest = await CooperativeJoinRequest.findOneAndUpdate(
    { _id: request._id, cooperativeId, status: "PENDING" },
    { $set: { status: "APPROVED", reviewedBy: adminId, reviewedAt: new Date() } },
    { new: true }
  ).populate("workerId", SAFE_WORKER_FIELDS).populate("cooperativeId").populate("reviewedBy", "fullName email");

  if (!updatedRequest) {
    await Worker.updateOne({ _id: worker._id, cooperativeId }, { $set: { cooperativeId: null } });
    await Cooperative.updateOne({ _id: cooperativeId, totalWorkers: { $gt: 0 } }, { $inc: { totalWorkers: -1 } });
    throw new apiError(409, "The join request was already processed.");
  }
  return updatedRequest;
};

export const rejectJoinRequest = async (requestId, adminId, cooperativeId, rejectionReason) => {
  if (!rejectionReason?.trim()) throw new apiError(400, "Rejection reason is required!");
  const updated = await CooperativeJoinRequest.findOneAndUpdate(
    { _id: requestId, cooperativeId, status: "PENDING" },
    { $set: { status: "REJECTED", reviewedBy: adminId, reviewedAt: new Date(), rejectionReason: rejectionReason.trim() } },
    { new: true }
  ).populate("workerId", SAFE_WORKER_FIELDS).populate("cooperativeId").populate("reviewedBy", "fullName email");
  if (!updated) throw new apiError(404, "Pending join request not found in your cooperative!");
  return updated;
};

export const getJoinRequests = async (cooperativeId) => {
  return CooperativeJoinRequest.find({ cooperativeId, status: "PENDING" }).populate("workerId", SAFE_WORKER_FIELDS).sort({ createdAt: -1 }).lean();
};


export const searchWorkerByPhone = async (cooperativeId, phone) => {
  const normalizedPhone = String(phone || "").trim();
  if (!normalizedPhone || !isValidIndianPhone(normalizedPhone)) throw new apiError(400, "Please enter a valid worker phone number.");
  const worker = await Worker.findOne({ cooperativeId, phone: normalizedPhone, isActive: true }).select(SAFE_WORKER_FIELDS).populate("cooperativeId", "name registrationNumber").lean();
  if (!worker) throw new apiError(404, "Worker not found in your cooperative.");
  return worker;
};

export const getServiceRequests = async (cooperativeId) => {
  const workerIds = await Worker.find({ cooperativeId, isActive: true }).distinct("_id");
  return Job.find({ $or: [{ assignedWorkerId: { $in: workerIds } }, { matchedWorkerIds: { $in: workerIds } }] })
    .select("service description experiencePreference amount status customerId assignedWorkerId createdAt updatedAt completion")
    .populate("customerId", "fullname fullName phone email")
    .populate("assignedWorkerId", "fullName phone profilePhoto status experienceCategory")
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
};

export const getReports = async (cooperativeId) => {
  const workerIds = await Worker.find({ cooperativeId, isActive: true }).distinct("_id");
  const match = { $or: [{ assignedWorkerId: { $in: workerIds } }, { matchedWorkerIds: { $in: workerIds } }] };
  const [statusBreakdown, serviceDemand, monthlyActivity] = await Promise.all([
    Job.aggregate([{ $match: match }, { $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Job.aggregate([{ $match: match }, { $group: { _id: "$service", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Job.aggregate([
      { $match: { ...match, createdAt: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } }, cancelled: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } } } },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
  ]);
  return { statusBreakdown, serviceDemand, monthlyActivity };
};

export const getCooperativeSettings = async (cooperativeId) => {
  const cooperative = await Cooperative.findById(cooperativeId).select("name registrationNumber type description contact address maxWorkers emergencyServiceEnabled demandForecastEnabled status isActive").lean();
  if (!cooperative) throw new apiError(404, "Cooperative not found!");
  return cooperative;
};

export const updateCooperativeSettings = async (cooperativeId, payload = {}) => {
  const allowed = ["name", "description", "maxWorkers", "emergencyServiceEnabled", "demandForecastEnabled"];
  const $set = {};
  for (const key of allowed) if (payload[key] !== undefined) $set[key] = payload[key];
  if (payload.contact) {
    $set["contact.phone"] = String(payload.contact.phone || "").trim();
    $set["contact.email"] = String(payload.contact.email || "").trim().toLowerCase();
    if (!isValidEmail($set["contact.email"])) throw new apiError(400, "Invalid cooperative email format.");
    if (!isValidIndianPhone($set["contact.phone"])) throw new apiError(400, "Invalid cooperative phone number.");
  }
  if (payload.address) $set.address = { ...payload.address };
  if ($set.name !== undefined && (!String($set.name).trim() || String($set.name).trim().length > 150)) throw new apiError(400, "Cooperative name is invalid.");
  if ($set.maxWorkers !== undefined) {
    $set.maxWorkers = Number($set.maxWorkers);
    if (!Number.isInteger($set.maxWorkers) || $set.maxWorkers < 1) throw new apiError(400, "Maximum workers must be a positive whole number.");
    const current = await Cooperative.findById(cooperativeId).select("totalWorkers").lean();
    if (current && $set.maxWorkers < current.totalWorkers) throw new apiError(400, "Maximum workers cannot be below the current worker count.");
  }
  const cooperative = await Cooperative.findOneAndUpdate({ _id: cooperativeId }, { $set }, { new: true, runValidators: true }).select("name registrationNumber type description contact address maxWorkers emergencyServiceEnabled demandForecastEnabled status isActive").lean();
  if (!cooperative) throw new apiError(404, "Cooperative not found!");
  return cooperative;
};

export const getAdminProfile = async (adminId) => {
  const admin = await (await import("./cooperative-admin.model.js")).CooperativeAdmin.findById(adminId).select("fullName email phone profilePhoto role isActive cooperativeId createdAt updatedAt").populate("cooperativeId", "name registrationNumber").lean();
  if (!admin) throw new apiError(404, "Cooperative admin profile not found!");
  return admin;
};

export const updateAdminProfile = async (adminId, payload = {}) => {
  const updates = {};
  if (payload.fullName !== undefined) {
    const name = String(payload.fullName).trim();
    if (name.length < 2 || name.length > 100) throw new apiError(400, "Full name must be between 2 and 100 characters.");
    updates.fullName = name;
  }
  if (payload.phone !== undefined) {
    const phone = String(payload.phone).trim();
    if (!isValidIndianPhone(phone)) throw new apiError(400, "Invalid Indian mobile number.");
    updates.phone = phone;
  }
  try {
    const admin = await (await import("./cooperative-admin.model.js")).CooperativeAdmin.findByIdAndUpdate(adminId, { $set: updates }, { new: true, runValidators: true }).select("fullName email phone profilePhoto role isActive cooperativeId createdAt updatedAt").populate("cooperativeId", "name registrationNumber").lean();
    if (!admin) throw new apiError(404, "Cooperative admin profile not found!");
    return admin;
  } catch (error) {
    if (error?.code === 11000) throw new apiError(409, "That phone number is already in use.");
    throw error;
  }
};
