import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const cooperativeAdminSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, unique: true, trim: true, index: true },
    profilePhoto: { type: String, default: null },
    password: { type: String, required: true, minlength: 8, select: false },
    cooperativeId: { type: mongoose.Schema.Types.ObjectId, ref: "Cooperative", required: true, index: true },
    role: { type: String, enum: ["COOPERATIVE_ADMIN"], default: "COOPERATIVE_ADMIN" },
    isActive: { type: Boolean, default: true, index: true },
    refreshToken: { type: String, default: null, select: false },
  },
  { timestamps: true }
);

cooperativeAdminSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

cooperativeAdminSchema.methods.isPasswordCorrect = function (password) {
  return bcrypt.compare(password, this.password);
};

cooperativeAdminSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      fullName: this.fullName,
      email: this.email,
      cooperativeId: this.cooperativeId,
      role: "COOPERATIVE_ADMIN",
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" }
  );
};

cooperativeAdminSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d" }
  );
};

export const CooperativeAdmin = mongoose.model("CooperativeAdmin", cooperativeAdminSchema);
