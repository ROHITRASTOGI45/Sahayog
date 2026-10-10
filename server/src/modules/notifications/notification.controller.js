import { Worker } from "../workers/worker.model.js";
import Notification from "./notification.model.js";

export const registerDevice = async (req, res) => {
  try {
    if (!req.worker) return res.status(401).json({ success: false, message: "Worker authentication required" });
    const { fcmToken } = req.body;
    if (!fcmToken || typeof fcmToken !== "string") return res.status(400).json({ success: false, message: "fcmToken is required" });
    await Worker.updateOne({ _id: req.worker._id }, { $addToSet: { fcmTokens: fcmToken } });
    return res.json({ success: true, message: "Worker device registered successfully" });
  } catch (error) { return res.status(500).json({ success: false, message: "Failed to register device" }); }
};

export const unregisterDevice = async (req, res) => {
  const { fcmToken } = req.body;
  if (!fcmToken) return res.status(400).json({ success: false, message: "fcmToken is required" });
  await Worker.updateOne({ _id: req.worker._id }, { $pull: { fcmTokens: fcmToken } });
  return res.json({ success: true, message: "Device unregistered" });
};

export const listWorkerNotifications = async (req, res) => {
  const notifications = await Notification.find({ workerId: req.worker._id }).sort({ createdAt: -1 }).limit(50).lean();
  return res.json({ success: true, notifications });
};

export const markNotificationRead = async (req, res) => {
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, workerId: req.worker._id }, { $set: { read: true } }, { new: true }).lean();
  if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
  return res.json({ success: true, notification });
};
