import mongoose from "mongoose";

const cooperativeJoinRequestSchema = new mongoose.Schema(
  {
    workerId: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", required: true, index: true },
    cooperativeId: { type: mongoose.Schema.Types.ObjectId, ref: "Cooperative", required: true, index: true },
    message: { type: String, trim: true, maxlength: 500, default: null },
    status: { type: String, enum: ["PENDING", "APPROVED", "ACCEPTED", "REJECTED"], default: "PENDING", index: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "CooperativeAdmin", default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true }
);

cooperativeJoinRequestSchema.index(
  { workerId: 1, cooperativeId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "PENDING" } }
);

export const CooperativeJoinRequest = mongoose.model("CooperativeJoinRequest", cooperativeJoinRequestSchema);
