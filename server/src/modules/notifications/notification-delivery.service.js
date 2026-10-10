import { getMessaging } from "../../config/firebase.js";
import { Worker } from "../workers/worker.model.js";
import Notification from "./notification.model.js";
import { isWorkerEligible } from "../workers/worker-eligibility.service.js";

const INVALID_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

const isObjectId = (value) =>
  /^[a-f\d]{24}$/i.test(String(value || ""));

export const notifyWorkers = async ({
  workerIds = [],
  requestId,
  service,
  description = "",
  locationAddress = null,
  experiencePreference = "ANY",
  amount = null,
  distanceByWorker = new Map(),
  directRequest = false,
  io = null,
}) => {
  if (!isObjectId(requestId)) {
    throw new Error("Invalid requestId");
  }

  const uniqueIds = [
    ...new Set(
      workerIds
        .map(String)
        .filter(isObjectId)
    ),
  ];

  if (!uniqueIds.length) return [];

  let messaging = null;

  try {
    messaging = getMessaging();
  } catch (error) {
    console.error(
      "Firebase unavailable:",
      error.message
    );
  }

  const results = [];

  for (const workerId of uniqueIds) {
    let notification = null;

    try {
      const eligible = await isWorkerEligible(workerId);
      if (!eligible) {
        results.push({
          workerId,
          success: false,
          message:
            "Worker is no longer available",
        });
        continue;
      }

      const worker = await Worker.findOne({
        _id: workerId,
        isActive: true,
        status: "AVAILABLE",
        isSuspended: { $ne: true },
      }).select("_id fcmTokens");

      if (!worker) {
        results.push({ workerId, success: false, message: "Worker is no longer available" });
        continue;
      }

      const title =
        directRequest ? `Direct ${service} Request` : `New ${service} Request`;

      const body =
        directRequest
          ? `A customer has requested you directly for ${service} service.`
          : `A customer needs ${service} service within 10 km.`;

      notification =
        await Notification.findOneAndUpdate(
          {
            workerId: worker._id,
            requestId,
            type: "NEW_SERVICE_REQUEST",
          },
          {
            $set: {
              title,
              body,
              status: "PENDING",
              error: null,
            },
            $setOnInsert: {
              workerId: worker._id,
              requestId,
              type: "NEW_SERVICE_REQUEST",
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );

      const tokens = [
        ...new Set(
          (worker.fcmTokens || [])
            .filter(Boolean)
        ),
      ];

      const invalidTokens = [];
      let sent = 0;
      let failed = 0;

      if (messaging && tokens.length) {
        const deliveries =
          await Promise.allSettled(
            tokens.map((token) =>
              messaging.send({
                notification: {
                  title,
                  body,
                },

                data: {
                  type:
                    "NEW_SERVICE_REQUEST",
                  requestId:
                    String(requestId),
                  service:
                    String(service),
                  description:
                    String(description),
                  distanceKm:
                    String(Number(distanceByWorker.get(String(worker._id)) || 0)),
                  locationAddress:
                    String(locationAddress?.formatted || "Location unavailable"),
                  experiencePreference: String(experiencePreference),
                  amount: amount == null ? "" : String(amount),
                  directRequest: String(Boolean(directRequest)),
                },

                token,
              })
            )
          );

        deliveries.forEach(
          (result, index) => {
            if (
              result.status ===
              "fulfilled"
            ) {
              sent += 1;
            } else {
              failed += 1;

              if (
                INVALID_TOKEN_ERRORS.has(
                  result.reason?.code
                )
              ) {
                invalidTokens.push(
                  tokens[index]
                );
              }

              console.error(
                `FCM failed for ${workerId}:`,
                result.reason?.code ||
                  result.reason?.message
              );
            }
          }
        );
      }

      if (invalidTokens.length) {
        await Worker.updateOne(
          { _id: worker._id },
          {
            $pull: {
              fcmTokens: {
                $in: invalidTokens,
              },
            },
          }
        );
      }

      let socketEmitted = false;

      if (io) {
        io.to(
          `worker:${worker._id}`
        ).emit(
          "new-service-request",
          {
            notificationId:
              notification._id.toString(),

            type:
              "NEW_SERVICE_REQUEST",

            requestId:
              String(requestId),

            service:
              String(service),

            description:
              String(description),

            distanceKm:
              Number(
                distanceByWorker.get(
                  String(worker._id)
                ) || 0
              ),

            location: {
              formatted: locationAddress?.formatted || "Location unavailable",
            },

            experiencePreference: String(experiencePreference),
            amount: amount == null ? null : Number(amount),
            directRequest: Boolean(directRequest),

            title,
            body,
          }
        );

        socketEmitted = true;
      }

      const delivered =
        sent > 0 || socketEmitted;

      notification.status =
        delivered
          ? "SENT"
          : "FAILED";

      notification.fcmSentCount = sent;
      notification.fcmFailedCount =
        failed;
      notification.socketEmitted =
        socketEmitted;

      notification.error = delivered
        ? null
        : "No notification transport succeeded";

      notification.sentAt =
        delivered
          ? new Date()
          : null;

      await notification.save();

      results.push({
        workerId:
          worker._id.toString(),

        notificationId:
          notification._id.toString(),

        success: delivered,

        fcm: {
          sent,
          failed,
        },

        socket: socketEmitted,
      });
    } catch (error) {
      if (notification) {
        notification.status =
          "FAILED";

        notification.error =
          error.message;

        await notification
          .save()
          .catch(() => {});
      }

      results.push({
        workerId,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
};


export const notifyWorkersRequestTaken = async ({
  workerIds = [],
  requestId,
  io = null,
}) => {
  const uniqueIds = [
    ...new Set(
      workerIds
        .map(String)
        .filter(isObjectId)
    ),
  ];

  if (!uniqueIds.length) return;

  let messaging = null;

  try {
    messaging = getMessaging();
  } catch (error) {
    console.error(
      "Firebase unavailable:",
      error.message
    );
  }

  for (const workerId of uniqueIds) {
    try {
      const worker =
        await Worker.findOne({
          _id: workerId,
          isActive: true,
        }).select("_id fcmTokens");

      if (!worker) continue;

      if (io) {
        io.to(
          `worker:${worker._id}`
        ).emit("request-taken", {
          requestId: String(requestId),
          message:
            "This request has already been accepted by another worker.",
        });
      }

      if (
        messaging &&
        worker.fcmTokens?.length
      ) {
        await Promise.allSettled(
          [
            ...new Set(
              worker.fcmTokens.filter(Boolean)
            ),
          ].map((token) =>
            messaging.send({
              notification: {
                title:
                  "Service Request Unavailable",
                body:
                  "Another worker has already accepted this request.",
              },
              data: {
                type: "REQUEST_TAKEN",
                requestId:
                  String(requestId),
              },
              token,
            })
          )
        );
      }
    } catch (error) {
      console.error(
        `Request-taken notification failed for ${workerId}:`,
        error.message
      );
    }
  }
};
