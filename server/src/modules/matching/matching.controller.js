import { detectService } from "./service-classifier.service.js";
import { findBestWorkers } from "./worker-matching.service.js";

export const matchWorker = async (req, res) => {
  try {
    const {
      description,
      service,
      latitude,
      longitude,
      limit = 10,
    } = req.body;

    if (
      latitude === undefined ||
      longitude === undefined
    ) {
      return res.status(400).json({
        success: false,
        message:
          "latitude and longitude are required",
      });
    }

    const detected =
      service ||
      (
        description
          ? await detectService(
              description
            )
          : { service: null }
      );

    if (!detected?.service) {
      return res.status(400).json({
        success: false,
        message:
          "Please select a valid service or provide a description",
        workerIds: [],
      });
    }

    const workers =
      await findBestWorkers({
        serviceName:
          detected.service,
        latitude,
        longitude,
        limit: Math.min(
          Number(limit) || 10,
          10
        ),
      });

    return res.json({
      success: true,

      request: {
        description:
          description || "",
        detectedService:
          detected.service,
        radiusKm: 10,
      },

      workerIds:
        workers.map((worker) =>
          worker.workerId.toString()
        ),

      matchedWorkers: workers,
    });
  } catch (error) {
    console.error(
      "Matching failed:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Matching failed",
    });
  }
};
