import Cooperative from "../cooperatives/cooperative.model.js";
import { CooperativeAdmin } from "../cooperatives/cooperative-admin.model.js";
import { apiError } from "../../shared/utils/api-error.js";
import { isValidEmail, isValidIndianPhone, isValidPassword } from "../../shared/utils/validation.js";
import { uploadOnCloudinary } from "../../shared/utils/cloudinary.js";
import { getCooperatives, requestToJoin, getDashboard, getWorkers, getWorker, updateWorkerStatus, updateWorkerExperienceCategory, acceptJoinRequest, rejectJoinRequest, getJoinRequests, registerCooperative, searchWorkerByPhone, getServiceRequests, getReports, getCooperativeSettings, updateCooperativeSettings, getAdminProfile, updateAdminProfile } from "../cooperatives/cooperative.service.js";

export { getCooperatives, requestToJoin, getDashboard, getWorkers, getWorker, updateWorkerStatus, updateWorkerExperienceCategory, acceptJoinRequest, rejectJoinRequest, getJoinRequests, searchWorkerByPhone, getServiceRequests, getReports, getCooperativeSettings, updateCooperativeSettings, getAdminProfile, updateAdminProfile };

export const registerCooperativeAdmin = async ({ fullName, email, phone, password, cooperativeId, profilePhoto }) => {
  if (!fullName?.trim() || !email?.trim() || !phone?.trim() || !password?.trim() || !cooperativeId) throw new apiError(400, "Full name, email, phone, password and cooperative ID are required!");
  if (!isValidEmail(email.trim().toLowerCase())) throw new apiError(400, "Invalid email format!");
  if (!isValidIndianPhone(phone.trim())) throw new apiError(400, "Invalid Indian mobile number.");
  if (!isValidPassword(password)) throw new apiError(400, "Password must be at least 8 characters and contain uppercase, lowercase, number and special character.");
  const cooperative = await Cooperative.findOne({
    _id: cooperativeId,
    status: { $in: ["PENDING", "ACTIVE"] },
  }).select("_id status isActive");
  if (!cooperative) throw new apiError(404, "Cooperative not found!");
  const exists = await CooperativeAdmin.findOne({ $or: [{ email: email.trim().toLowerCase() }, { phone: phone.trim() }] }).select("email phone").lean();
  if (exists) throw new apiError(409, "A cooperative admin with this email or phone already exists!");
  if (profilePhoto) {
    if (profilePhoto.size < 100 * 1024) throw new apiError(400, "Profile photo must be at least 100 KB!");
    if (profilePhoto.size > 5 * 1024 * 1024) throw new apiError(400, "Profile photo must not exceed 5 MB!");
  }
  let profilePhotoUrl = null;
  if (profilePhoto?.path) {
    const uploaded = await uploadOnCloudinary(profilePhoto.path);
    if (!uploaded) throw new apiError(500, "Failed to upload profile photo!");
    profilePhotoUrl = uploaded.secure_url || uploaded.url;
  }
  const admin = await CooperativeAdmin.create({ fullName: fullName.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password, cooperativeId, profilePhoto: profilePhotoUrl });
  return CooperativeAdmin.findById(admin._id).select("-password -refreshToken").lean();
};

export const registerCooperativeOwner = async (payload, profilePhoto = null) => {
  const { cooperative, admin } = payload || {};
  if (!cooperative || !admin) throw new apiError(400, "Cooperative and admin details are required!");
  const createdCooperative = await registerCooperative(cooperative);
  try {
    const createdAdmin = await registerCooperativeAdmin({ ...admin, cooperativeId: createdCooperative._id, profilePhoto });
    return { cooperative: createdCooperative, cooperativeAdmin: createdAdmin };
  } catch (error) {
    await Cooperative.deleteOne({ _id: createdCooperative._id });
    throw error;
  }
};

export const loginCooperativeAdmin = async ({ email, password }) => {
  if (!email?.trim() || !password?.trim()) throw new apiError(400, "Email and password are required!");
  const admin = await CooperativeAdmin.findOne({ email: email.trim().toLowerCase() }).select("+password +refreshToken");
  if (!admin) throw new apiError(401, "Invalid email or password!");
  if (!admin.isActive) throw new apiError(403, "Cooperative owner account is inactive!");

  const cooperative = await Cooperative.findById(admin.cooperativeId).select("status isActive name").lean();
  if (!cooperative || cooperative.status !== "ACTIVE" || !cooperative.isActive) {
    throw new apiError(403, "Your cooperative is awaiting System Admin verification. You can log in after approval.");
  }

  if (!(await admin.isPasswordCorrect(password))) throw new apiError(401, "Invalid email or password!");
  const accessToken = admin.generateAccessToken();
  const refreshToken = admin.generateRefreshToken();
  await CooperativeAdmin.updateOne({ _id: admin._id }, { $set: { refreshToken } });
  const loggedInAdmin = await CooperativeAdmin.findById(admin._id).select("-password -refreshToken").lean();
  return { cooperativeAdmin: loggedInAdmin, accessToken, refreshToken };
};

export const logoutCooperativeAdmin = async (adminId) => {
  await CooperativeAdmin.updateOne({ _id: adminId }, { $set: { refreshToken: null } });
};

