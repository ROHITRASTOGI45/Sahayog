import dotenv from "dotenv";
dotenv.config({ path: "./.env" });
import {v2 as cloudinary} from "cloudinary";
import fs from "fs";



cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});



//* localFilePath = Atar mne holo j kono image ba file upload er por pathname jeta thke...ex: "cars.jpg".
const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) return null; // agr koi data yani files, images, videos, etc... nhi bheja gya user se to return ro null ko ki aage kya hoga pta nhi.

    // if user send data or file have a filepath, then we upload it on cloudinary.
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    console.log("File successfully uploaded to Cloudinary.");
    try { fs.unlinkSync(localFilePath); } catch {}
    return response;
    
  } catch (error) {
  console.error("Cloudinary upload failed.");
  if (localFilePath) {
    try { fs.unlinkSync(localFilePath); } catch {}
  }
  return null;
}
}

export {uploadOnCloudinary};