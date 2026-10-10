import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGO_URI;

        if (!mongoUri) {
            throw new Error("MONGO_URI is not defined");
        }

        if (
            !mongoUri.startsWith("mongodb://") &&
            !mongoUri.startsWith("mongodb+srv://")
        ) {
            throw new Error(`Invalid MONGO_URI: ${mongoUri}`);
        }

        const conn = await mongoose.connect(mongoUri);

        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error("MongoDB connection error:", error.message);
        throw error;
    }
};

export default connectDB;
