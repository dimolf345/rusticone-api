import { stat } from "node:fs/promises";
import path from "node:path";

import { resolveImageUploader } from "../config/image-uploader.js";
import { LOCAL_UPLOAD_DIR } from "../config/local-storage.js";
import { BadRequestError, NotFoundError } from "../errors/index.js";
import type {
  ICloudinaryUploader,
  IUploadResult,
  IUploadService,
  IUploadSessionStore,
  IUploadedFile
} from "../interfaces/upload/index.js";
import { logger } from "../logger/index.js";
import { RedisUploadSessionStore } from "./upload-session-store.service.js";

export const TEMP_FOLDER = "temp-catering";

export class UploadService implements IUploadService {
  constructor(
    private readonly uploader: ICloudinaryUploader = resolveImageUploader(),
    private readonly sessionStore: IUploadSessionStore = new RedisUploadSessionStore()
  ) {}

  async uploadTemp(files: IUploadedFile[]): Promise<IUploadResult> {
    logger.info({ fileCount: files.length }, "Uploading temporary product images");

    const uploadResults = await Promise.all(
      files.map((file) => this.uploader(file.buffer, TEMP_FOLDER))
    );
    const imageUrls = uploadResults.map((result) => result.secure_url);

    const uploadSessionId = await this.sessionStore.save(imageUrls);

    logger.info(
      { uploadSessionId, imageCount: imageUrls.length },
      "Temporary product images cached"
    );

    return { uploadSessionId, imageUrls };
  }

  async getTempImagePath(filename: string): Promise<string> {
    logger.info({ filename }, "Resolving local temporary image path");

    const trimmedFilename = filename.trim();
    if (
      !trimmedFilename ||
      path.basename(trimmedFilename) !== trimmedFilename ||
      trimmedFilename.includes("..")
    ) {
      logger.warn({ filename }, "Rejected invalid local temporary image filename");
      throw new BadRequestError("Invalid image filename");
    }

    const targetDir = path.resolve(LOCAL_UPLOAD_DIR, TEMP_FOLDER);
    const filePath = path.resolve(targetDir, trimmedFilename);

    if (!filePath.startsWith(`${targetDir}${path.sep}`)) {
      logger.warn({ filename }, "Rejected out-of-bounds local temporary image path");
      throw new BadRequestError("Invalid image filename");
    }

    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) {
        throw new NotFoundError("Uploaded image not found");
      }
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.warn({ filename, filePath }, "Requested local temporary image was not found");
      throw new NotFoundError("Uploaded image not found");
    }

    logger.info({ filename: trimmedFilename, filePath }, "Resolved local temporary image path");
    return filePath;
  }
}
