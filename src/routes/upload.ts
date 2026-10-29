import { Router } from "express";

import { UploadController } from "../controllers/upload.controller.js";
import type { IUploadRouterDependencies } from "../interfaces/upload/index.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { isAdminMiddleware } from "../middleware/is-admin.middleware.js";
import { uploadImages } from "../middleware/upload.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createUploadRouter(dependencies: IUploadRouterDependencies = {}) {
  const router = Router();
  const controller = new UploadController(dependencies.service);

  router.use(authMiddleware);

  router.post(
    "/temp",
    isAdminMiddleware,
    uploadImages,
    asyncHandler(controller.uploadTemp)
  );

  if (process.env.NODE_ENV !== "production") {
    router.get(
      "/temp-catering/:filename",
      asyncHandler(controller.getTempImage)
    );
    router.get(
      "/temp/:filename",
      asyncHandler(controller.getTempImage)
    );
  }

  return router;
}

export const uploadsRouter = createUploadRouter();
