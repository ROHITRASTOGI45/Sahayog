import mongoose from "mongoose";
import { loginCustomerService } from "./customer-auth.service.js";
import { registerCustomerService } from "./customer-registration.service.js";
import { apiResponse } from "../../shared/utils/api-response.js";
import { asyncErrorHandler } from "../../shared/utils/async-handler.js";
import { Customer } from "./customer.model.js";
import { Worker } from "../workers/worker.model.js";
import Rating from "../jobs/rating.model.js";

const registerCustomer = asyncErrorHandler(async (req, res) => {
  const createdCustomer = await registerCustomerService(req.body);
  return res.status(201).json(new apiResponse(201, createdCustomer, "Customer registered successfully!"));
});

const loginCustomer = asyncErrorHandler(async (req, res) => {
  const { customer, accessToken, refreshToken } = await loginCustomerService(req.body);
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", maxAge: 15 * 60 * 1000 };
  const refreshOptions = { ...options, maxAge: 7 * 24 * 60 * 60 * 1000 };
  return res.status(200).cookie("customerAccessToken", accessToken, options).cookie("customerRefreshToken", refreshToken, refreshOptions).json(new apiResponse(200, { customer }, "Customer logged in successfully!"));
});

const logoutCustomer = asyncErrorHandler(async (req, res) => {
  if (req.customer) await Customer.findByIdAndUpdate(req.customer._id, { $set: { refreshToken: null } });
  return res.status(200).clearCookie("customerAccessToken").clearCookie("customerRefreshToken").json(new apiResponse(200, null, "Customer logged out successfully!"));
});

export { registerCustomer, loginCustomer, logoutCustomer };

const getCustomerProfile = asyncErrorHandler(async (req, res) => {
  const customer = await Customer.findById(req.customer._id).select("-password -refreshToken").lean();
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
  return res.status(200).json({ success: true, customer });
});

const getProfessionalProfile = asyncErrorHandler(async (req, res) => {
  const workerId = req.params.workerId;

  if (!mongoose.isValidObjectId(workerId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid professional id",
    });
  }

  // This endpoint is the source of truth for the customer-facing profile modal.
  // Always fetch the worker and ratings from MongoDB so the modal never relies
  // on the potentially stale assignedWorker snapshot returned by /jobs/mine.
  const worker = await Worker.findById(workerId)
    .select(
      "fullName email phone profilePhoto service skills experienceYears experienceCategory totalJobsCompleted averageRating totalRatings cooperativeId status isActive isSuspended"
    )
    .populate("cooperativeId", "name")
    .lean();

  if (!worker) {
    return res.status(404).json({
      success: false,
      message: "Professional not found",
    });
  }

  const ratings = await Rating.find({ workerId: worker._id })
    .select("_id rating review createdAt")
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  const professional = {
    ...worker,
    id: String(worker._id),
    ratings: ratings.map((rating) => ({
      id: String(rating._id),
      rating: rating.rating,
      review: rating.review || "",
      createdAt: rating.createdAt,
    })),
    cooperative: worker.cooperativeId
      ? {
          id: String(worker.cooperativeId._id),
          name: worker.cooperativeId.name || null,
        }
      : null,
  };

  return res.status(200).json({
    success: true,
    professional,
  });
});

const listSavedProfessionals = asyncErrorHandler(async (req, res) => {
  const customer = await Customer.findById(req.customer._id).populate({
    path: "savedProfessionals",
    select: "fullName email phone profilePhoto service skills experienceYears experienceCategory totalJobsCompleted averageRating totalRatings cooperativeId status isActive isSuspended",
    populate: { path: "cooperativeId", select: "name" },
  }).lean();

  const professionals = (customer?.savedProfessionals || []).filter(Boolean);
  const workerIds = professionals.map((worker) => worker._id);
  const ratings = workerIds.length
    ? await Rating.find({ workerId: { $in: workerIds } })
        .select("workerId rating review createdAt")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean()
    : [];

  const ratingsByWorker = new Map();
  for (const rating of ratings) {
    const key = String(rating.workerId);
    if (!ratingsByWorker.has(key)) ratingsByWorker.set(key, []);
    ratingsByWorker.get(key).push({
      id: String(rating._id),
      rating: rating.rating,
      review: rating.review || "",
      createdAt: rating.createdAt,
    });
  }

  return res.status(200).json({
    success: true,
    professionals: professionals.map((worker) => ({
      ...worker,
      ratings: ratingsByWorker.get(String(worker._id)) || [],
    })),
  });
});

const saveProfessional = asyncErrorHandler(async (req, res) => {
  const workerId = req.params.workerId;
  const exists = await Worker.exists({ _id: workerId, isActive: true });
  if (!exists) return res.status(404).json({ success: false, message: "Professional not found" });
  await Customer.findByIdAndUpdate(req.customer._id, { $addToSet: { savedProfessionals: workerId } });
  return res.status(200).json({ success: true, message: "Professional saved" });
});

const removeSavedProfessional = asyncErrorHandler(async (req, res) => {
  await Customer.findByIdAndUpdate(req.customer._id, { $pull: { savedProfessionals: req.params.workerId } });
  return res.status(200).json({ success: true, message: "Professional removed" });
});

export { getCustomerProfile, getProfessionalProfile, listSavedProfessionals, saveProfessional, removeSavedProfessional };

