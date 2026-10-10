import jwt from "jsonwebtoken";
import { Worker } from "../../modules/workers/worker.model.js";
import { Customer } from "../../modules/customers/customer.model.js";
import { CooperativeAdmin } from "../../modules/cooperatives/cooperative-admin.model.js";
import { apiError } from "../utils/api-error.js";
import { asyncErrorHandler } from "../utils/async-handler.js";

const verifyRoleJWT = (role) =>
  asyncErrorHandler(async (req, res, next) => {
    const cookieName = role === "CUSTOMER" ? "customerAccessToken" : "workerAccessToken";
    const token =
      req.cookies?.[cookieName] ||
      req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      throw new apiError(401, "Unauthorized request. Access token is required!");
    }

    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

      if (decoded.role !== role) {
        throw new Error("Invalid role");
      }

      if (role === "CUSTOMER") {
        const customer = await Customer.findById(decoded._id).select("-password -refreshToken");
        if (!customer || !customer.isActive) throw new Error();
        req.customer = customer;
      } else {
        const worker = await Worker.findById(decoded._id).select("-password -refreshToken");
        if (!worker || !worker.isActive) throw new Error();
        req.worker = worker;
      }

      next();
    } catch {
      throw new apiError(401, "Invalid or expired access token!");
    }
  });

export const verifyCustomerJWT = verifyRoleJWT("CUSTOMER");
export const verifyWorkerJWT = verifyRoleJWT("WORKER");

// Kept for backwards compatibility with any legacy route.
// New customer/worker routes should use the role-specific middleware above.
export const verifyJWT = asyncErrorHandler(async (req, res, next) => {
  const bearerToken = req.header("Authorization")?.replace("Bearer ", "");
  const token =
    bearerToken ||
    req.cookies?.customerAccessToken ||
    req.cookies?.workerAccessToken ||
    req.cookies?.accessToken;

  if (!token) {
    throw new apiError(401, "Unauthorized request. Access token is required!");
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    if (decoded.role === "CUSTOMER") {
      const customer = await Customer.findById(decoded._id).select("-password -refreshToken");
      if (!customer || !customer.isActive) throw new Error();
      req.customer = customer;
    } else if (decoded.role === "WORKER") {
      const worker = await Worker.findById(decoded._id).select("-password -refreshToken");
      if (!worker || !worker.isActive) throw new Error();
      req.worker = worker;
    } else {
      throw new Error();
    }

    next();
  } catch {
    throw new apiError(401, "Invalid or expired access token!");
  }
});


export const verifyCooperativeAdminJWT = asyncErrorHandler(async (req, res, next) => {
  const token =
    req.cookies?.cooperativeAdminAccessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    throw new apiError(401, "Unauthorized request. Cooperative admin access token is required!");
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    if (decoded.role !== "COOPERATIVE_ADMIN") throw new Error("Invalid role");

    const admin = await CooperativeAdmin.findById(decoded._id).select("-password -refreshToken");
    if (!admin || !admin.isActive) throw new Error("Invalid admin");

    req.cooperativeAdmin = admin;
    next();
  } catch {
    throw new apiError(401, "Invalid or expired cooperative admin access token!");
  }
});


export const verifySystemAdminJWT = asyncErrorHandler(async (req, res, next) => {
  const token =
    req.cookies?.systemAdminAccessToken ||
    req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    throw new apiError(401, "Unauthorized request. System Admin access token is required!");
  }

  try {
    const decoded = jwt.verify(token, process.env.SYSTEM_ADMIN_JWT_SECRET || process.env.ACCESS_TOKEN_SECRET);
    if (decoded.role !== "SYSTEM_ADMIN") throw new Error("Invalid role");
    req.systemAdmin = { email: decoded.email, role: decoded.role };
    next();
  } catch {
    throw new apiError(401, "Invalid or expired System Admin access token!");
  }
});
