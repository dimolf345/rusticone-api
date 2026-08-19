import multer from "multer";

import { BadRequestError } from "../errors/index.js";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_FILES = 5;

// Keep files in memory as buffers for direct streaming to Cloudinary.
const storage = multer.memoryStorage();

export const uploadImages = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES },
  fileFilter: (_request, file, callback) => {
    if (file.mimetype.startsWith("image/")) {
      callback(null, true);
      return;
    }
    callback(new BadRequestError("Only image files are allowed"));
  }
}).array("images", MAX_FILES);
