import express from "express";
import {
  verifyCustomerJWT,
} from "../../shared/middleware/auth.middleware.js";
import {
  requireCustomer,
} from "../../shared/middleware/role.middleware.js";
import {
  createJob,
  listCustomerJobs,
  cancelJob,
  confirmJobCompletion,
  disputeJobCompletion,
  createJobRating,
} from "./job.controller.js";

const router = express.Router();

router.use(
  verifyCustomerJWT,
  requireCustomer
);

router.post(
  "/create",
  createJob
);

router.get(
  "/mine",
  listCustomerJobs
);

router.patch(
  "/:id/cancel",
  cancelJob
);

router.post(
  "/:id/confirm-completion",
  confirmJobCompletion
);

router.post(
  "/:id/dispute-completion",
  disputeJobCompletion
);

router.post(
  "/:id/rating",
  createJobRating
);

export default router;
