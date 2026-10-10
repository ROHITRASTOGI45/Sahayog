import dotenv from "dotenv";
import mongoose from "mongoose";
import { Worker } from "../modules/workers/worker.model.js";
dotenv.config({ path: "./.env" });

// Migrates the old notification-only worker document shape in-place.
// It does NOT invent credentials, verification, location, or skills.
const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const legacy = await mongoose.connection.collection("workers").find({}).toArray();
  let changed = 0;
  for (const w of legacy) {
    const update = {};
    if (!w.fullName && w.name) update.fullName = w.name;
    if (!w.skills?.length && w.service) update.skills = [{ service: w.service, experienceYears: Number(w.experienceYears || 0), skillLevel: w.skillLevel === "ADVANCED" ? "EXPERT" : (w.skillLevel || "BEGINNER") }];
    if (!w.status) update.status = w.isOnline && w.isAvailable ? "AVAILABLE" : "OFFLINE";
    if (w.isOnline !== undefined || w.isAvailable !== undefined) { /* legacy flags are intentionally retained */ }
    if (Object.keys(update).length) { await Worker.updateOne({ _id: w._id }, { $set: update }); changed++; }
  }
  console.log(`Legacy worker migration complete. Updated ${changed} document(s).`);
  await mongoose.disconnect();
};
run().catch(async e => { console.error(e); await mongoose.disconnect(); process.exit(1); });
