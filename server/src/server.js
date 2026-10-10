import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
import http from "http";
import { Server } from "socket.io";
import connectDB from "./database/connect.js";
import { app } from "./app.js";
import { registerWorkerSocket } from "./realtime/worker.socket.js";

const requiredSecrets = ["ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"];
if (process.env.NODE_ENV === "production") {
  requiredSecrets.push("SYSTEM_ADMIN_JWT_SECRET", "SYSTEM_ADMIN_EMAIL", "SYSTEM_ADMIN_PASSWORD", "CLIENT_ORIGINS", "MONGO_URI");
}
const missingSecrets = requiredSecrets.filter((name) => !String(process.env[name] || "").trim());
if (missingSecrets.length) {
  console.error(`Missing required environment configuration: ${missingSecrets.join(", ")}`);
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  for (const name of ["ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET", "SYSTEM_ADMIN_JWT_SECRET"]) {
    if (String(process.env[name]).length < 32) {
      console.error(`${name} must be at least 32 characters in production.`);
      process.exit(1);
    }
  }
}

const port = Number(process.env.PORT || 5000);
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: (process.env.CLIENT_ORIGINS || "http://localhost:5173").split(",").map(s => s.trim()), credentials: true } });
app.set("io", io);
registerWorkerSocket(io);

connectDB().then(() => httpServer.listen(port, "0.0.0.0", () => console.log(`Sahayog integrated server running on port ${port}`))).catch((err) => { console.error("MongoDB connect ERROR:", err); process.exit(1); });
