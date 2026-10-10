import jwt from "jsonwebtoken";
import Cooperative from "../cooperatives/cooperative.model.js";
import { apiError } from "../../shared/utils/api-error.js";

const getConfiguredCredentials = () => {
  const email = String(process.env.SYSTEM_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.SYSTEM_ADMIN_PASSWORD || "");
  if (!email || !password) {
    throw new apiError(500, "System Admin credentials are not configured on the server.");
  }
  return { email, password };
};

const signToken = (email) => jwt.sign(
  { email, role: "SYSTEM_ADMIN" },
  (process.env.SYSTEM_ADMIN_JWT_SECRET || process.env.ACCESS_TOKEN_SECRET),
  { expiresIn: process.env.SYSTEM_ADMIN_TOKEN_EXPIRY || "8h" }
);

export const loginSystemAdmin = async ({ email, password }) => {
  if (!email?.trim() || !password) throw new apiError(400, "Email and password are required!");
  const configured = getConfiguredCredentials();
  if (!process.env.SYSTEM_ADMIN_JWT_SECRET && process.env.NODE_ENV === "production") {
    throw new apiError(500, "System Admin signing secret is not configured on the server.");
  }
  if (email.trim().toLowerCase() !== configured.email || password !== configured.password) {
    throw new apiError(401, "Invalid System Admin credentials!");
  }
  return { email: configured.email, role: "SYSTEM_ADMIN", accessToken: signToken(configured.email) };
};

export const listCooperativesForVerification = async (status = "PENDING") => {
  const filter = status === "ALL" ? {} : { status };
  return Cooperative.find(filter)
    .select("name registrationNumber type description contact address location status isActive maxWorkers totalWorkers createdAt updatedAt")
    .sort({ createdAt: -1 })
    .lean();
};

export const approveCooperative = async (cooperativeId) => {
  const cooperative = await Cooperative.findByIdAndUpdate(
    cooperativeId,
    { $set: { status: "ACTIVE", isActive: true } },
    { new: true, runValidators: true }
  ).select("name registrationNumber type contact address status isActive maxWorkers totalWorkers").lean();
  if (!cooperative) throw new apiError(404, "Cooperative not found!");
  return cooperative;
};

export const rejectCooperative = async (cooperativeId, reason) => {
  const rejectionReason = String(reason || "").trim();
  if (!rejectionReason) throw new apiError(400, "Rejection reason is required!");
  const cooperative = await Cooperative.findByIdAndUpdate(
    cooperativeId,
    { $set: { status: "INACTIVE", isActive: false, rejectionReason } },
    { new: true, runValidators: true }
  ).select("name registrationNumber type contact address status isActive rejectionReason").lean();
  if (!cooperative) throw new apiError(404, "Cooperative not found!");
  return cooperative;
};
