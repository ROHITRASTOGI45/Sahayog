import { apiResponse } from "../../shared/utils/api-response.js";
import { asyncErrorHandler } from "../../shared/utils/async-handler.js";
import { loginSystemAdmin, listCooperativesForVerification, approveCooperative, rejectCooperative } from "./system-admin.service.js";

export const login = asyncErrorHandler(async (req, res) => {
  const result = await loginSystemAdmin(req.body || {});
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 8 * 60 * 60 * 1000,
  };
  return res.status(200)
    .cookie("systemAdminAccessToken", result.accessToken, options)
    .json(new apiResponse(200, { admin: { email: result.email, role: result.role } }, "System Admin logged in successfully!"));
});

export const logout = asyncErrorHandler(async (req, res) => {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  };
  return res.status(200).clearCookie("systemAdminAccessToken", options).json(new apiResponse(200, null, "System Admin logged out successfully!"));
});

export const cooperatives = asyncErrorHandler(async (req, res) => {
  const status = String(req.query.status || "PENDING").toUpperCase();
  const allowed = ["PENDING", "ACTIVE", "INACTIVE", "SUSPENDED", "ALL"];
  if (!allowed.includes(status)) return res.status(400).json({ success: false, message: "Invalid cooperative status" });
  return res.json(new apiResponse(200, { cooperatives: await listCooperativesForVerification(status) }, "Cooperatives fetched successfully!"));
});

export const approve = asyncErrorHandler(async (req, res) => {
  return res.json(new apiResponse(200, { cooperative: await approveCooperative(req.params.cooperativeId) }, "Cooperative approved successfully!"));
});

export const reject = asyncErrorHandler(async (req, res) => {
  return res.json(new apiResponse(200, { cooperative: await rejectCooperative(req.params.cooperativeId, req.body?.reason) }, "Cooperative rejected successfully!"));
});
