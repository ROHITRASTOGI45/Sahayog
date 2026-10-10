import { Router } from "express";
import { login, logout, cooperatives, approve, reject } from "./system-admin.controller.js";
import { verifySystemAdminJWT } from "../../shared/middleware/auth.middleware.js";
import { requireSystemAdmin } from "../../shared/middleware/role.middleware.js";
import { rateLimit } from "../../shared/middleware/rate-limit.middleware.js";

const router = Router();
router.post("/login", rateLimit({ max: 5, windowMs: 15 * 60 * 1000 }), login);
router.use(verifySystemAdminJWT, requireSystemAdmin);
router.post("/logout", logout);
router.get("/cooperatives", cooperatives);
router.patch("/cooperatives/:cooperativeId/approve", approve);
router.patch("/cooperatives/:cooperativeId/reject", reject);
export default router;
