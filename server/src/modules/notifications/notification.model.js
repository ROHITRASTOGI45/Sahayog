import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", required: true, index: true },
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "Job", required: true, index: true },
    type: { type: String, enum: ["NEW_SERVICE_REQUEST"], default: "NEW_SERVICE_REQUEST", required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    status: { type: String, enum: ["PENDING", "SENT", "FAILED"], default: "PENDING" },
    fcmSentCount: { type: Number, default: 0 },
    fcmFailedCount: { type: Number, default: 0 },
    socketEmitted: { type: Boolean, default: false },
    error: { type: String, default: null },
    read: { type: Boolean, default: false },
    sentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ workerId: 1, requestId: 1, type: 1 }, { unique: true, partialFilterExpression: { workerId: { $exists: true }, requestId: { $exists: true }, type: { $exists: true } } });
notificationSchema.index({ workerId: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
