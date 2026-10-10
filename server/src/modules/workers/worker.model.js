import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// ============================================================
// WORKER SKILL SCHEMA
// ============================================================

const workerSkillSchema = new mongoose.Schema(
  {
    service: {
      type: String,
      required: true,
      trim: true,
    },

    experienceYears: {
      type: Number,
      required: true,
      min: 0,
      max: 60,
    },

    skillLevel: {
      type: String,
      enum: ["BEGINNER", "INTERMEDIATE", "EXPERT"],
      required: true,
    },
  },
  {
    _id: false,
  }
);

// ============================================================
// WORKER SCHEMA
// ============================================================

const workerSchema = new mongoose.Schema(
  {
    // --------------------------------------------------------
    // BASIC INFORMATION
    // --------------------------------------------------------

    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    // --------------------------------------------------------
    // ADDRESS
    // --------------------------------------------------------

    address: {
      house: {
        type: String,
        trim: true,
      },

      area: {
        type: String,
        trim: true,
      },

      city: {
        type: String,
        trim: true,
      },

      state: {
        type: String,
        trim: true,
      },

      pincode: {
        type: String,
        trim: true,
      },
    },

    // --------------------------------------------------------
    // LOCATION ARCHITECTURE
    // --------------------------------------------------------
    // registrationLocation = the worker's home/work area used for
    // cooperative discovery and joining. It is NOT used for customer
    // service matching.
    //
    // currentLocation = the worker's live location from the worker
    // dashboard. This is the ONLY worker location used by the
    // customer-to-worker matching service.

    registrationLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number],
        validate: {
          validator: function (value) {
            if (value == null) return true;
            return (
              Array.isArray(value) &&
              value.length === 2 &&
              value.every(
                (coordinate) =>
                  typeof coordinate === "number" &&
                  Number.isFinite(coordinate)
              ) &&
              value[0] >= -180 &&
              value[0] <= 180 &&
              value[1] >= -90 &&
              value[1] <= 90
            );
          },
          message: "Registration coordinates must be [longitude, latitude]",
        },
      },
      area: { type: String, trim: true, default: null },
      city: { type: String, trim: true, default: null },
      state: { type: String, trim: true, default: null },
      pincode: { type: String, trim: true, default: null },
    },

    currentLocation: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
        validate: {
          validator: function (value) {
            if (value == null) return true;
            return (
              Array.isArray(value) &&
              value.length === 2 &&
              value.every(
                (coordinate) =>
                  typeof coordinate === "number" &&
                  Number.isFinite(coordinate)
              ) &&
              value[0] >= -180 &&
              value[0] <= 180 &&
              value[1] >= -90 &&
              value[1] <= 90
            );
          },
          message: "Current coordinates must be [longitude, latitude]",
        },
      },
    },

    // --------------------------------------------------------
    // DOCUMENTS / PROFILE
    // --------------------------------------------------------

    profilePhoto: {
      type: String,
      default: null,
    },

    aadhaarCard: {
      type: String,
      default: null,
    },

    cooperativeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cooperative",
      default: null,
    },

    // --------------------------------------------------------
    // SERVICES / SKILLS
    // --------------------------------------------------------

    skills: {
      type: [workerSkillSchema],
      default: [],
    },

    // Legacy single-service field.
    // Kept so existing data continues to work.
    service: {
      type: String,
      trim: true,
      default: null,
    },

    skillLevel: {
      type: String,

      enum: [
        "BEGINNER",
        "INTERMEDIATE",
        "ADVANCED",
        "EXPERT",
      ],

      default: null,
    },

    experienceYears: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Cooperative-admin controlled marketplace category. Workers cannot self-assign this.
    experienceCategory: {
      type: String,
      enum: ["PENDING", "ANY", "EXPERIENCED"],
      default: "PENDING",
      index: true,
    },

    // --------------------------------------------------------
    // WORKER STATUS
    // --------------------------------------------------------

    isSuspended: {
      type: Boolean,
      default: false,
      index: true,
    },

    status: {
      type: String,

      enum: [
        "AVAILABLE",
        "BUSY",
        "OFFLINE",
        "SUSPENDED",
      ],

      default: "OFFLINE",

      index: true,
    },

    // --------------------------------------------------------
    // PERFORMANCE
    // --------------------------------------------------------

    totalJobsCompleted: {
      type: Number,
      min: 0,
      default: 0,
    },

    averageRating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0,
    },

    totalRatings: {
      type: Number,
      min: 0,
      default: 0,
    },


    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // --------------------------------------------------------
    // FIREBASE
    // --------------------------------------------------------

    fcmTokens: {
      type: [String],
      default: [],
    },

    // --------------------------------------------------------
    // AUTH TOKENS
    // --------------------------------------------------------

    refreshToken: {
      type: String,
      default: null,
      select: false,
    },

    resetPasswordOtp: {
      type: String,
      default: null,
      select: false,
    },

    resetPasswordOtpExpiry: {
      type: Date,
      default: null,
      select: false,
    },

    isResetPasswordOtpVerified: {
      type: Boolean,
      default: false,
    },
  },

  {
    timestamps: true,
  }
);

// ============================================================
// INDEXES
// ============================================================

// Required for MongoDB $near / geospatial search.
workerSchema.index({
  currentLocation: "2dsphere",
});

// Quickly find workers eligible for jobs.
workerSchema.index({
  status: 1,
  isActive: 1,
});

// Quickly find workers by service.
workerSchema.index({
  "skills.service": 1,
});

// ============================================================
// PASSWORD HASHING
// ============================================================

workerSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// ============================================================
// PASSWORD CHECK
// ============================================================

workerSchema.methods.isPasswordCorrect =
  async function (password) {
    return bcrypt.compare(
      password,
      this.password
    );
  };

// ============================================================
// ACCESS TOKEN
// ============================================================

workerSchema.methods.generateAccessToken =
  function () {
    return jwt.sign(
      {
        _id: this._id,
        fullName: this.fullName,
        email: this.email,
        role: "WORKER",
      },

      process.env.ACCESS_TOKEN_SECRET,

      {
        expiresIn:
          process.env.ACCESS_TOKEN_EXPIRY ||
          "15m",
      }
    );
  };

// ============================================================
// REFRESH TOKEN
// ============================================================

workerSchema.methods.generateRefreshToken =
  function () {
    return jwt.sign(
      {
        _id: this._id,
      },

      process.env.REFRESH_TOKEN_SECRET,

      {
        expiresIn:
          process.env.REFRESH_TOKEN_EXPIRY ||
          "7d",
      }
    );
  };

// ============================================================
// MODEL EXPORT
// ============================================================

// IMPORTANT:
// This is a NAMED export.
//
// Therefore import it using:
// import { Worker } from "./worker.model.js";
//
// DO NOT use a default import for this model.
// ============================================================

export const Worker =
  mongoose.model("Worker", workerSchema);
