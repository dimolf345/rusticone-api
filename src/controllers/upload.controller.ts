import type { Request, Response } from "express";

import { BadRequestError, NotFoundError } from "../errors/index.js";
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

  /** Serves a locally stored temporary image in non-production environments. */
  public getTempImage = async (
    request: Request<{ filename?: string }>,
    response: Response
  ): Promise<void> => {
    if (process.env.NODE_ENV === "production") {
      throw new NotFoundError("Route not found");
    }

    const { filename } = request.params;

    if (!filename) {
      throw new BadRequestError("Image filename is required");
    }

    request.log.info({ filename }, "Retrieving locally uploaded temporary image");

    const filePath = await this.service.getTempImagePath(filename);

    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    await new Promise<void>((resolve, reject) => {
      response.sendFile(filePath, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    request.log.info({ filename }, "Served locally uploaded temporary image");
  };
}
