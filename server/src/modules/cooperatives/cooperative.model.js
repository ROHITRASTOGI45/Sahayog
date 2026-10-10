import mongoose from "mongoose";

const cooperativeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },

    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    type: {
      type: String,
      enum: [
        "LABOUR_COOPERATIVE",
        "LABOUR_COOPERATIVE_SOCIETY",
        "FEDERATION",
      ],
      required: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    contact: {
      phone: {
        type: String,
        required: true,
        trim: true,
      },

      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
      },
    },

    address: {
      house: {
        type: String,
        trim: true,
      },

      area: {
        type: String,
        required: true,
        trim: true,
      },

      city: {
        type: String,
        required: true,
        trim: true,
      },

      state: {
        type: String,
        required: true,
        trim: true,
      },

      pincode: {
        type: String,
        required: true,
        trim: true,
      },
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },

      coordinates: {
        type: [Number],
        required: true,
      },
    },

    services: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
      },
    ],

    // Alias used by the cooperative management layer.
    serviceCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Service",
      },
    ],

    federationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Federation",
      default: null,
    },

    maxWorkers: {
      type: Number,
      min: 1,
      default: 50,
    },

    activeWorkers: {
      type: Number,
      min: 0,
      default: 0,
    },

    verifiedWorkers: {
      type: Number,
      min: 0,
      default: 0,
    },

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

    welfareFund: {
      type: Number,
      min: 0,
      default: 0,
    },

    emergencyServiceEnabled: {
      type: Boolean,
      default: false,
    },

    demandForecastEnabled: {
      type: Boolean,
      default: true,
    },

    totalWorkers: {
      type: Number,
      default: 0,
      min: 0,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    status: {
      type: String,
      enum: ["PENDING", "ACTIVE", "SUSPENDED", "INACTIVE"],
      default: "PENDING",
      required: true,
    },
    isActive: {
     type: Boolean,
     default: true,
},
  },
  {
    timestamps: true,
  }
);

cooperativeSchema.index({ location: "2dsphere" });

const Cooperative = mongoose.model("Cooperative", cooperativeSchema);

export default Cooperative;