import dotenv from "dotenv";
dotenv.config({ path: "./.env" });

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import customerRouter from "./modules/customers/customer.routes.js";
import workerRouter from "./modules/workers/worker.routes.js";
import jobRouter from "./modules/jobs/job.routes.js";
import notificationRouter from "./modules/notifications/notification.routes.js";
import matchingRouter from "./modules/matching/matching.routes.js";
import workerJobRouter from "./modules/jobs/worker-job.routes.js";
import locationRouter from "./modules/location/location.routes.js";
import cooperativeRouter from "./modules/cooperatives/cooperative.routes.js";
import cooperativeAdminRouter from "./modules/cooperative-admin/cooperative-admin.routes.js";
import systemAdminRouter from "./modules/system-admin/system-admin.routes.js";

const app = express();

/* =========================
   CORS CONFIGURATION
========================= */

const allowedOrigins = (process.env.CLIENT_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);



app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser clients may omit Origin; authentication/authorization still applies.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS origin not allowed"));
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "Cache-Control",
      "Pragma",
    ],
  })
);

/* =========================
   MIDDLEWARE
========================= */

app.use(express.json({ limit: "1mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);

app.use(cookieParser());

// Baseline browser security headers without adding a runtime dependency.
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

/* =========================
   BASIC ROUTES
========================= */

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Sahayog Integrated Backend API is running",
  });
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "sahayog-backend",
    timestamp: new Date().toISOString(),
  });
});

/* =========================
   API ROUTES
========================= */

app.use("/api/v1/customers", customerRouter);

app.use("/api/v1/workers", workerRouter);

app.use("/api/v1/jobs", jobRouter);

app.use("/api/v1/worker-jobs", workerJobRouter);

app.use("/api/v1/matching", matchingRouter);

app.use("/api/v1/notifications", notificationRouter);

app.use("/api/v1/location", locationRouter);

app.use("/api/v1/cooperatives", cooperativeRouter);

app.use("/api/v1/cooperative-admin", cooperativeAdminRouter);

app.use("/api/v1/system-admin", systemAdminRouter);

/* =========================
   ERROR HANDLER
========================= */

app.use((err, req, res, next) => {
  // Avoid leaking stack traces, file paths, request bodies, or credentials in production.
  if (process.env.NODE_ENV === "production") {
    console.error(`[api-error] ${req.method} ${req.path} status=${Number(err.statusCode) || 500}`);
  } else {
    console.error(err);
  }

  const status = Number(err.statusCode) || 500;

  res.status(status).json({
    success: false,
    message:
      status >= 500
        ? "Internal server error"
        : err.message || "Request failed",
    errors: err.errors || [],
  });
});

export { app };