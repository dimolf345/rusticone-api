import type { Request, Response } from "express";

import { BadRequestError } from "../errors/index.js";
import type { IUploadService } from "../interfaces/upload/index.js";
import { UploadService } from "../services/upload.service.js";

export class UploadController {
  constructor(private readonly service: IUploadService = new UploadService()) {}

  /** Pre-uploads image files and returns a session id referencing the cached URLs. */
  public uploadTemp = async (request: Request, response: Response): Promise<void> => {
    const files = (request.files as Express.Multer.File[] | undefined) ?? [];

    if (files.length === 0) {
      throw new BadRequestError("No image files provided");
    }

    request.log.info({ fileCount: files.length }, "Pre-uploading product images");

    const result = await this.service.uploadTemp(files);

    response.status(200).json({
      message: "Images pre-uploaded successfully",
      uploadSessionId: result.uploadSessionId,
      imageUrls: result.imageUrls
    });
  };
}
