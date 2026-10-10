import { Worker } from "./worker.model.js";
import { apiError } from "../../shared/utils/api-error.js";

const logoutWorkerService = async (workerId) => {
  const worker = await Worker.findById(workerId);

  if (!worker) {
    throw new apiError(404, "Worker not found!");
  }

  await Worker.updateOne(
    { _id: workerId },
    { $set: { refreshToken: null } }
  );

  return true;
};

export { logoutWorkerService };
