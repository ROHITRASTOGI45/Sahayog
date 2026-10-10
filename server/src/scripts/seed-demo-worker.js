import dotenv from "dotenv";
import mongoose from "mongoose";
import { Worker } from "../modules/workers/worker.model.js";
dotenv.config({ path: "./.env" });
const run=async()=>{await mongoose.connect(process.env.MONGO_URI);const email=process.argv[2];const lat=Number(process.argv[3]);const lon=Number(process.argv[4]);if(!email||![lat,lon].every(Number.isFinite))throw new Error("Usage: npm run db:seed-demo-worker -- email latitude longitude");const w=await Worker.findOneAndUpdate({email},{status:"AVAILABLE",isActive:true,location:{type:"Point",coordinates:[lon,lat]}},{new:true}).select("_id fullName email status location skills");if(!w)throw new Error("Worker not found");console.log(w);await mongoose.disconnect()};run().catch(async e=>{console.error(e.message);await mongoose.disconnect();process.exit(1)});
