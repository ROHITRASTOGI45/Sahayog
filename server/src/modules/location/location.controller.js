import { reverseGeocode } from "./location.service.js";

export const reverseGeocodeLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};
    const address = await reverseGeocode(latitude, longitude);
    return res.json({ success: true, data: { address } });
  } catch (error) {
    const status = Number(error.statusCode) || 502;
    console.error("Reverse geocoding failed:", error.message);
    return res.status(status).json({
      success: false,
      message: "We couldn't resolve your location to an address. We'll still use your current location for matching.",
    });
  }
};
