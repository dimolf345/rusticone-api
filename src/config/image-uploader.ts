import type { ICloudinaryUploader } from "../interfaces/upload/index.js";
import { uploadBufferToCloudinary } from "./cloudinary.js";
import { uploadBufferToLocal } from "./local-storage.js";

/**
 * Selects the image uploader for the current environment: Cloudinary in
 * production, and the local upload folder everywhere else so development does
 * not require Cloudinary credentials.
 */
export function resolveImageUploader(): ICloudinaryUploader {
  return process.env.NODE_ENV === "production"
    ? uploadBufferToCloudinary
    : uploadBufferToLocal;
}
