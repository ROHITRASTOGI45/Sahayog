import { Router } from "express";
import { registerCooperativeController } from "./cooperative.controller.js";
import { rateLimit } from "../../shared/middleware/rate-limit.middleware.js";
const router = Router();
router.post("/register", rateLimit({ max: 5 }), registerCooperativeController);
export default router;
