import jwt from "jsonwebtoken";
import { Worker } from "../modules/workers/worker.model.js";
import { Customer } from "../modules/customers/customer.model.js";

const readCookie = (cookieHeader, name) => {
  if (!cookieHeader) return null;

  const item = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) =>
      part.startsWith(`${name}=`)
    );

  return item
    ? decodeURIComponent(
        item.substring(name.length + 1)
      )
    : null;
};

export const registerWorkerSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const requestedRole = String(socket.handshake.auth?.role || "").toUpperCase();
      const customerToken = readCookie(socket.handshake.headers.cookie, "customerAccessToken");
      const workerToken = readCookie(socket.handshake.headers.cookie, "workerAccessToken");

      const token =
        requestedRole === "CUSTOMER"
          ? customerToken || socket.handshake.auth?.token
          : requestedRole === "WORKER"
            ? workerToken || socket.handshake.auth?.token
            : customerToken || workerToken || socket.handshake.auth?.token;

      if (!token) {
        return next(
          new Error("Authentication required")
        );
      }

      const decoded = jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET
      );

      if (
        decoded.role === "WORKER"
      ) {
        const worker =
          await Worker.findOne({
            _id: decoded._id,
            isActive: true,
          }).select(
            "_id fullName email role"
          );

        if (!worker) {
          return next(
            new Error("Worker not found")
          );
        }

        socket.user = {
          id: worker._id.toString(),
          role: "WORKER",
        };

        socket.join(
          `worker:${worker._id}`
        );
      } else if (
        decoded.role === "CUSTOMER"
      ) {
        const customer =
          await Customer.findOne({
            _id: decoded._id,
            isActive: true,
          }).select(
            "_id fullname email"
          );

        if (!customer) {
          return next(
            new Error("Customer not found")
          );
        }

        socket.user = {
          id: customer._id.toString(),
          role: "CUSTOMER",
        };

        socket.join(
          `customer:${customer._id}`
        );
      } else {
        return next(
          new Error("Invalid role")
        );
      }

      next();
    } catch {
      next(
        new Error(
          "Invalid or expired socket authentication"
        )
      );
    }
  });

  io.on("connection", (socket) => {
    console.log(
      `Socket connected: ${socket.user.role}:${socket.user.id}`
    );

    socket.on("disconnect", (reason) => {
      console.log(
        `Socket disconnected: ${socket.user.role}:${socket.user.id} (${reason})`
      );
    });
  });
};
