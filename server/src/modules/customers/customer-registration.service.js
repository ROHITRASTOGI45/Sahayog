import { Customer } from "./customer.model.js";
import { uploadOnCloudinary } from "../../shared/utils/cloudinary.js";

import { apiError } from "../../shared/utils/api-error.js";

import {
  isValidEmail,
  isValidPassword,
  isValidIndianPhone,
  isValidIndianPincode,
} from "../../shared/utils/validation.js";


const parseJsonField = (value, fallback = {}) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { throw new apiError(400, "Invalid address or location data."); }
};

const registerCustomerService = async ({
  fullname,
  email,
  phone,
  password,
  address,
  location,
  profilePhoto,
}) => {

  address = parseJsonField(address, {});
  location = parseJsonField(location, undefined);

  if (
    !fullname?.trim() ||
    !email?.trim() ||
    !phone?.trim() ||
    !password?.trim()
  ) {
    throw new apiError(
      400,
      "Name, email, phone and password are required!"
    );
  }



  const trimmedName = fullname.trim();

  if (trimmedName.length > 50) {
    throw new apiError(
      400,
      "Name must be under 100 characters!"
    );
  }



  const normalizedEmail = email.trim().toLowerCase();

  if (!isValidEmail(normalizedEmail)) {
    throw new apiError(
      400,
      "Invalid email format!"
    );
  }



  const normalizedPhone = phone.trim();

  if (!isValidIndianPhone(normalizedPhone)) {
    throw new apiError(
      400,
      "Invalid Indian mobile number. Enter a valid 10-digit number starting with 6, 7, 8 or 9."
    );
  }


 
  if (!isValidPassword(password)) {
    throw new apiError(
      400,
      "Password must be at least 8 characters and contain uppercase, lowercase, number and special character."
    );
  }



  if (address?.pincode) {

    if (!isValidIndianPincode(address.pincode.trim())) {
      throw new apiError(
        400,
        "Invalid Indian pincode. Pincode must be a valid 6-digit number."
      );
    }
  }



  if (location?.coordinates) {

    if (
      !Array.isArray(location.coordinates) ||
      location.coordinates.length !== 2
    ) {
      throw new apiError(
        400,
        "Location coordinates must contain longitude and latitude."
      );
    }

    const [longitude, latitude] = location.coordinates;

    if (
      typeof longitude !== "number" ||
      typeof latitude !== "number" ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) {
      throw new apiError(
        400,
        "Invalid location coordinates."
      );
    }
  }



  const existingCustomer = await Customer.findOne({
    $or: [
      { email: normalizedEmail },
      { phone: normalizedPhone },
    ],
  });


  if (existingCustomer) {

    if (existingCustomer.email === normalizedEmail) {
      throw new apiError(
        409,
        "Customer with this email already exists!"
      );
    }

    if (existingCustomer.phone === normalizedPhone) {
      throw new apiError(
        409,
        "Customer with this phone number already exists!"
      );
    }
  }



  if (profilePhoto) {
    if (profilePhoto.size < 100 * 1024) {
      throw new apiError(400, "Profile photo must be at least 100 KB!");
    }
    if (profilePhoto.size > 5 * 1024 * 1024) {
      throw new apiError(400, "Profile photo must not exceed 5 MB!");
    }
  }

  let profilePhotoUrl = null;
  if (profilePhoto?.path) {
    const uploaded = await uploadOnCloudinary(profilePhoto.path);
    if (!uploaded) throw new apiError(500, "Failed to upload profile photo!");
    profilePhotoUrl = uploaded.secure_url || uploaded.url;
  }

  const customer = await Customer.create({
    fullname: trimmedName,
    email: normalizedEmail,
    phone: normalizedPhone,
    password,
    address,
    location,
    profilePhoto: profilePhotoUrl,
  });


  const createdCustomer = await Customer.findById(
    customer._id
  ).select("-password -refreshToken");


  if (!createdCustomer) {
    throw new apiError(
      500,
      "Failed to fetch created customer."
    );
  }


  return createdCustomer;
};


export {
  registerCustomerService,
};
