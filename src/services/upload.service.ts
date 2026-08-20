import { resolveImageUploader } from "../config/image-uploader.js";
import type {
  ICloudinaryUploader,
  IUploadResult,
  IUploadService,
  IUploadSessionStore,
  IUploadedFile
} from "../interfaces/upload/index.js";
import { logger } from "../logger/index.js";
import { RedisUploadSessionStore } from "./upload-session-store.service.js";

const TEMP_FOLDER = "temp-catering";

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
}
