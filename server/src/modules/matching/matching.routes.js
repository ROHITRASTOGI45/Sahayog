import express from "express";
import { verifyCustomerJWT } from "../../shared/middleware/auth.middleware.js";
import { requireCustomer } from "../../shared/middleware/role.middleware.js";
import { matchWorker } from "./matching.controller.js";
const router = express.Router();
router.use(verifyCustomerJWT, requireCustomer);
router.post("/match", matchWorker);
export default router;
