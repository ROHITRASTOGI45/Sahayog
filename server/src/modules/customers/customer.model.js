import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const customerSchema = new mongoose.Schema(
  {
    fullname: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    phone: { type: String, required: true, unique: true, trim: true, index: true },
    password: { type: String, required: true, minlength: 8, select: false },
    address: {
      house: { type: String, trim: true }, area: { type: String, trim: true },
      city: { type: String, trim: true }, state: { type: String, trim: true }, pincode: { type: String, trim: true },
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point", required: true },
      coordinates: { type: [Number], default: [0, 0], required: true },
    },
    profilePhoto: { type: String, default: null },
    savedProfessionals: [{ type: mongoose.Schema.Types.ObjectId, ref: "Worker" }],
    isActive: { type: Boolean, default: true, index: true },
    refreshToken: { type: String, default: null, select: false },
  },
  { timestamps: true }
);

customerSchema.index({ location: "2dsphere" });

customerSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

customerSchema.methods.isPasswordCorrect = async function (password) {
  return bcrypt.compare(password, this.password);
};

customerSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { _id: this._id, fullname: this.fullname, email: this.email, role: "CUSTOMER" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" }
  );
};

customerSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ _id: this._id }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
  });
};

export const Customer = mongoose.model("Customer", customerSchema);
