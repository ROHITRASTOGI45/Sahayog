import { Worker } from "./worker.model.js";
import Cooperative from "../cooperatives/cooperative.model.js";

/**
 * A worker is eligible for new customer service work only when:
 * - the worker account is active;
 * - the worker is available; and
 * - the worker belongs to an ACTIVE cooperative.
 *
 * cooperativeId is assigned only after an APPROVED cooperative join request,
 * but the cooperative is checked again here so eligibility cannot survive
 * cooperative suspension/rejection/deactivation.
 */
export const getEligibleWorker = async (workerId, { requireAvailable = true } = {}) => {
  const worker = await Worker.findOne({
    _id: workerId,
    isActive: true,
    ...(requireAvailable ? { status: "AVAILABLE" } : {}),
  })
    .select("_id fullName email phone profilePhoto currentLocation registrationLocation skills service skillLevel experienceYears experienceCategory averageRating totalRatings totalJobsCompleted cooperativeId status isActive")
    .lean();

  if (!worker?.cooperativeId) return null;

  const cooperative = await Cooperative.findOne({
    _id: worker.cooperativeId,
    status: "ACTIVE",
    isActive: true,
  })
    .select("_id status isActive")
    .lean();

  return cooperative ? worker : null;
};

export const isWorkerEligible = async (workerId, options = {}) => {
  return Boolean(await getEligibleWorker(workerId, options));
};

export const getActiveCooperativeIds = async () => {
  return Cooperative.find({
    status: "ACTIVE",
    isActive: true,
  }).distinct("_id");
};
