import { Router } from "express";
import { verifyJWT } from "../../shared/middleware/auth.middleware.js";
import { reverseGeocodeLocation } from "./location.controller.js";

const router = Router();
// Reverse geocoding is safe for authenticated customers and workers because it
// only converts coordinates into a display address. Do not restrict this route
// to customer authentication: the worker dashboard also needs it.
router.use(verifyJWT);
router.post("/reverse-geocode", reverseGeocodeLocation);
export default router;
