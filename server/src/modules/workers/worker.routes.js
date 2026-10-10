import { Router } from "express";

import {
  loginWorker,
  registerWorker,
  logoutWorker,
  getWorkerMe,
  updateWorkerLocation,
  listCooperatives,
  getPendingCooperativeRequests,
  requestCooperative
} from "./worker.controller.js";

import { multerStorage } from "../../shared/middleware/upload.middleware.js";
import { verifyWorkerJWT } from "../../shared/middleware/auth.middleware.js";
import { requireWorker } from "../../shared/middleware/role.middleware.js";
import { rateLimit } from "../../shared/middleware/rate-limit.middleware.js";

const router = Router();

router.post(
  "/register",
  rateLimit({ max: 8 }),
  multerStorage.fields([
    { name: "profilePhoto", maxCount: 1 },
    { name: "aadhaarCard", maxCount: 1 }
  ]),
  registerWorker
);

router.post("/login", rateLimit({ max: 10 }), loginWorker);

router.use(verifyWorkerJWT, requireWorker);

router.get("/me", getWorkerMe);

router.patch("/location", updateWorkerLocation);

router.get("/cooperatives", listCooperatives);

router.get(
  "/cooperative-requests",
  getPendingCooperativeRequests
);

router.post(
  "/cooperatives/:cooperativeId/request",
  requestCooperative
);

router.post("/logout", logoutWorker);

export default router;