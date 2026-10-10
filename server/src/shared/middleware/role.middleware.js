import { apiError } from "../utils/api-error.js";

export const requireCustomer = (req, res, next) => {
  if (!req.customer) return next(new apiError(403, "Customer access required"));
  next();
};

export const requireWorker = (req, res, next) => {
  if (!req.worker) return next(new apiError(403, "Worker access required"));
  next();
};

export const requireCooperativeAdmin = (req, res, next) => {
  if (!req.cooperativeAdmin) return next(new apiError(403, "Cooperative admin access required"));
  next();
};


export const requireSystemAdmin = (req, res, next) => {
  if (!req.systemAdmin) return next(new apiError(403, "System Admin access required"));
  next();
};
