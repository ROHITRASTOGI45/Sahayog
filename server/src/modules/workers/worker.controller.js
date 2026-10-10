import { registerWorkerService } from "./worker-registration.service.js";
import { loginWorkerService } from "./worker-auth.service.js";
import { logoutWorkerService } from "./worker-logout.service.js";
import { Worker } from "./worker.model.js";
import { apiResponse } from "../../shared/utils/api-response.js";
import { asyncErrorHandler } from "../../shared/utils/async-handler.js";
import { getCooperatives, requestToJoin, getWorkerPendingJoinRequests } from "../cooperatives/cooperative.service.js";
import { getEligibleWorker } from "./worker-eligibility.service.js";
import Job from "../jobs/job.model.js";

const registerWorker = asyncErrorHandler(async (req, res) => {
  const profilePhoto = req.files?.profilePhoto?.[0];
  const aadhaarCard = req.files?.aadhaarCard?.[0];
  const worker = await registerWorkerService({ ...req.body, profilePhoto, aadhaarCard });
  return res.status(201).json(new apiResponse(201, worker, "Worker registered successfully!"));
});

const loginWorker = asyncErrorHandler(async (req, res) => {
  const { worker, accessToken, refreshToken } = await loginWorkerService(req.body);
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", maxAge: 15 * 60 * 1000 };
  const refreshOptions = { ...options, maxAge: 7 * 24 * 60 * 60 * 1000 };
  return res.status(200).cookie("workerAccessToken", accessToken, options).cookie("workerRefreshToken", refreshToken, refreshOptions).json(new apiResponse(200, { worker }, "Worker logged in successfully!"));
});

const logoutWorker = asyncErrorHandler(async (req, res) => {
  await logoutWorkerService(req.worker._id);
  return res.status(200).clearCookie("workerAccessToken").clearCookie("workerRefreshToken").json(new apiResponse(200, null, "Worker logged out successfully!"));
});


const updateWorkerLocation = asyncErrorHandler(async (req, res) => {
  const latitude = Number(req.body?.latitude);
  const longitude = Number(req.body?.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid location coordinates.",
    });
  }

  const updatedWorker = await Worker.findByIdAndUpdate(
    req.worker._id,
    {
      $set: {
        currentLocation: {
          type: "Point",
          coordinates: [longitude, latitude],
        },
      },
    },
    { new: true, runValidators: true }
  )
    .select("-password -refreshToken -resetPasswordOtp -resetPasswordOtpExpiry")
    .populate("cooperativeId", "name registrationNumber type status")
    .lean();

  if (!updatedWorker) {
    return res.status(404).json({
      success: false,
      message: "Worker profile not found.",
    });
  }

  return res.json(
    new apiResponse(200, { worker: updatedWorker }, "Worker location updated successfully")
  );
});

const getWorkerMe = asyncErrorHandler(async (req, res) => {
  const currentWorker = await Worker.findById(req.worker._id)
    .select("-password -refreshToken -resetPasswordOtp -resetPasswordOtpExpiry")
    .populate("cooperativeId", "name registrationNumber type status")
    .lean();

  if (!currentWorker) {
    return res.status(404).json({ success: false, message: "Worker profile not found" });
  }

  const hasActiveJob = await Job.exists({
    assignedWorkerId: currentWorker._id,
    status: { $in: ["ASSIGNED", "IN_PROGRESS", "WORK_COMPLETION_REQUESTED", "CUSTOMER_DISPUTED"] },
  });

  let effectiveStatus = currentWorker.status;
  if (currentWorker.isSuspended) {
    effectiveStatus = "SUSPENDED";
  } else if (hasActiveJob) {
    effectiveStatus = "BUSY";
  } else if (currentWorker.cooperativeId) {
    effectiveStatus = "AVAILABLE";
  }

  if (effectiveStatus !== currentWorker.status) {
    await Worker.updateOne({ _id: currentWorker._id }, { $set: { status: effectiveStatus } });
    currentWorker.status = effectiveStatus;
  }

  return res.json(new apiResponse(200, { worker: currentWorker }, "Worker profile fetched"));
});
const listCooperatives = asyncErrorHandler(async (req, res) => {
  const latitude = req.query?.latitude;
  const longitude = req.query?.longitude;
  const cooperatives = await getCooperatives(latitude, longitude);
  return res.json(new apiResponse(200, { cooperatives }, "Cooperatives fetched successfully!"));
});

const getPendingCooperativeRequests = asyncErrorHandler(async (req, res) => {
  const requests = await getWorkerPendingJoinRequests(req.worker._id);
  return res.json(new apiResponse(200, { requests }, "Pending cooperative requests fetched successfully!"));
});

const requestCooperative = asyncErrorHandler(async (req, res) => {
  const request = await requestToJoin(req.worker._id, req.params.cooperativeId, req.body?.message);
  return res.status(201).json(new apiResponse(201, { request }, "Cooperative join request sent successfully!"));
});

export { registerWorker, loginWorker, logoutWorker, getWorkerMe, updateWorkerLocation, listCooperatives, getPendingCooperativeRequests, requestCooperative };
