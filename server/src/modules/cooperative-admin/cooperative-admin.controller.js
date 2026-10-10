import { apiResponse } from "../../shared/utils/api-response.js";
import { asyncErrorHandler } from "../../shared/utils/async-handler.js";
import { apiError } from "../../shared/utils/api-error.js";
import { registerCooperativeOwner, registerCooperativeAdmin, loginCooperativeAdmin, logoutCooperativeAdmin, getJoinRequests, acceptJoinRequest, rejectJoinRequest, getDashboard, getWorkers, getWorker, updateWorkerStatus, updateWorkerExperienceCategory, searchWorkerByPhone, getServiceRequests, getReports, getCooperativeSettings, updateCooperativeSettings, getAdminProfile, updateAdminProfile } from "./cooperative-admin.service.js";

const requireAdmin = (req) => { if (!req.cooperativeAdmin) throw new apiError(403, "Cooperative admin access is required!"); };

export const registerOwner = asyncErrorHandler(async (req, res) => {
  const profilePhoto = req.file || req.files?.profilePhoto?.[0] || null;
  let payload = req.body || {};
  try {
    payload = {
      ...payload,
      cooperative: typeof payload.cooperative === "string" ? JSON.parse(payload.cooperative) : payload.cooperative,
      admin: typeof payload.admin === "string" ? JSON.parse(payload.admin) : payload.admin,
    };
  } catch {
    throw new apiError(400, "Invalid cooperative registration data.");
  }
  return res.status(201).json(new apiResponse(201, await registerCooperativeOwner(payload, profilePhoto), "Cooperative owner registered successfully!"));
});
export const registerAdmin = asyncErrorHandler(async (req, res) => {
  requireAdmin(req);
  const payload = { ...(req.body || {}), cooperativeId: String(req.cooperativeAdmin.cooperativeId) };
  return res.status(201).json(new apiResponse(201, await registerCooperativeAdmin(payload), "Cooperative admin registered successfully!"));
});
export const loginAdmin = asyncErrorHandler(async (req, res) => {
  const { cooperativeAdmin, accessToken, refreshToken } = await loginCooperativeAdmin(req.body || {});
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "none" : "lax" };
  return res.status(200).cookie("cooperativeAdminAccessToken", accessToken, { ...options, maxAge: 15 * 60 * 1000 }).cookie("cooperativeAdminRefreshToken", refreshToken, { ...options, maxAge: 7 * 24 * 60 * 60 * 1000 }).json(new apiResponse(200, { cooperativeAdmin }, "Cooperative admin logged in successfully!"));
});
export const logoutAdmin = asyncErrorHandler(async (req, res) => { requireAdmin(req); await logoutCooperativeAdmin(req.cooperativeAdmin._id); const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "none" : "lax" }; return res.status(200).clearCookie("cooperativeAdminAccessToken", options).clearCookie("cooperativeAdminRefreshToken", options).json(new apiResponse(200, null, "Cooperative admin logged out successfully!")); });
export const joinRequests = asyncErrorHandler(async (req, res) => { requireAdmin(req); return res.json(new apiResponse(200, await getJoinRequests(req.cooperativeAdmin.cooperativeId), "Join requests fetched successfully!")); });
export const acceptRequest = asyncErrorHandler(async (req, res) => { requireAdmin(req); return res.json(new apiResponse(200, await acceptJoinRequest(req.params.requestId, req.cooperativeAdmin._id, req.cooperativeAdmin.cooperativeId), "Worker join request accepted successfully!")); });
export const rejectRequest = asyncErrorHandler(async (req, res) => { requireAdmin(req); return res.json(new apiResponse(200, await rejectJoinRequest(req.params.requestId, req.cooperativeAdmin._id, req.cooperativeAdmin.cooperativeId, req.body?.rejectionReason), "Worker join request rejected successfully!")); });
export const dashboard = asyncErrorHandler(async (req, res) => { requireAdmin(req); return res.json(new apiResponse(200, await getDashboard(req.cooperativeAdmin.cooperativeId), "Cooperative dashboard fetched successfully!")); });
export const workers = asyncErrorHandler(async (req, res) => { requireAdmin(req); return res.json(new apiResponse(200, await getWorkers(req.cooperativeAdmin.cooperativeId), "Cooperative workers fetched successfully!")); });
export const worker = asyncErrorHandler(async (req, res) => { requireAdmin(req); return res.json(new apiResponse(200, await getWorker(req.cooperativeAdmin.cooperativeId, req.params.workerId), "Worker details fetched successfully!")); });
export const workerStatus = asyncErrorHandler(async (req, res) => { requireAdmin(req); return res.json(new apiResponse(200, await updateWorkerStatus(req.cooperativeAdmin.cooperativeId, req.params.workerId, req.body?.status), "Worker status updated successfully!")); });

export const workerExperienceCategory = asyncErrorHandler(async (req, res) => {
  requireAdmin(req);
  const category = String(req.body?.experienceCategory || "").toUpperCase();
  const worker = await updateWorkerExperienceCategory(req.cooperativeAdmin.cooperativeId, req.params.workerId, category);
  return res.json(new apiResponse(200, worker, "Worker experience category updated successfully!"));
});

export const searchWorker = asyncErrorHandler(async (req, res) => {
  requireAdmin(req);
  const worker = await searchWorkerByPhone(req.cooperativeAdmin.cooperativeId, req.query?.phone);
  return res.json(new apiResponse(200, { worker }, "Worker found successfully!"));
});
export const serviceRequests = asyncErrorHandler(async (req, res) => {
  requireAdmin(req);
  const serviceRequests = await getServiceRequests(req.cooperativeAdmin.cooperativeId);
  return res.json(new apiResponse(200, { requests: serviceRequests }, "Cooperative service requests fetched successfully!"));
});
export const reports = asyncErrorHandler(async (req, res) => {
  requireAdmin(req);
  return res.json(new apiResponse(200, await getReports(req.cooperativeAdmin.cooperativeId), "Cooperative reports fetched successfully!"));
});
export const settings = asyncErrorHandler(async (req, res) => {
  requireAdmin(req);
  if (req.method === "PATCH") return res.json(new apiResponse(200, await updateCooperativeSettings(req.cooperativeAdmin.cooperativeId, req.body || {}), "Cooperative settings updated successfully!"));
  return res.json(new apiResponse(200, { cooperative: await getCooperativeSettings(req.cooperativeAdmin.cooperativeId) }, "Cooperative settings fetched successfully!"));
});
export const profile = asyncErrorHandler(async (req, res) => {
  requireAdmin(req);
  if (req.method === "PATCH") {
    const admin = await updateAdminProfile(req.cooperativeAdmin._id, req.body || {});
    return res.json(new apiResponse(200, { admin }, "Profile updated successfully!"));
  }
  return res.json(new apiResponse(200, { admin: await getAdminProfile(req.cooperativeAdmin._id) }, "Profile fetched successfully!"));
});
