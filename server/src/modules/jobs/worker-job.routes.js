import express from "express";
import {
  verifyWorkerJWT,
} from "../../shared/middleware/auth.middleware.js";
import {
  requireWorker,
} from "../../shared/middleware/role.middleware.js";
import {
  listWorkerRequests,
  listWorkerActiveJobs,
  acceptJob,
  rejectJob,
  startJob,
  requestJobCompletion,
  verifyJobCompletion,
  listWorkerHistory,
  listWorkerCompletedJobs,
  listWorkerCancelledJobs,
} from "./job.controller.js";

const router = express.Router();

router.use(
  verifyWorkerJWT,
  requireWorker
);

router.get(
  "/requests",
  listWorkerRequests
);

router.get(
  "/active",
  listWorkerActiveJobs
);

router.post(
  "/:id/accept",
  acceptJob
);

router.post(
  "/:id/reject",
  rejectJob
);

router.post(
  "/:id/start",
  startJob
);

router.post(
  "/:id/request-completion",
  requestJobCompletion
);

router.post(
  "/:id/verify-completion",
  verifyJobCompletion
);

router.get(
  "/history",
  listWorkerHistory
);

router.get(
  "/completed-jobs",
  listWorkerCompletedJobs
);

router.get(
  "/cancelled-jobs",
  listWorkerCancelledJobs
);

export default router;
