import { v2 as cloudinary } from "cloudinary";

import { logger } from "../logger/index.js";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/** Streams an in-memory file buffer to Cloudinary and resolves with the upload result. */
export function uploadBufferToCloudinary(
  fileBuffer: Buffer,
  folder = "catering-products"
): Promise<{ secure_url: string }> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", fetch_format: "auto", quality: "auto" },
      (error, result) => {
        if (error || !result) {
          logger.error({ err: error }, "Cloudinary upload failed");
          reject(
            new Error(error?.message ?? "Cloudinary upload returned no result")
          );
          return;
        }
        resolve({ secure_url: result.secure_url });
      }
    );

    uploadStream.end(fileBuffer);
  });
}

export default cloudinary;
