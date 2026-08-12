import { Router } from "express";

import { UserController } from "../controllers/user.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { isAdminMiddleware } from "../middleware/is-admin.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createUserRouter(controller = new UserController()) {
  const router = Router();

  router.use(authMiddleware);

  router.post("/", isAdminMiddleware, asyncHandler(controller.createOne));
  router.get("/", isAdminMiddleware, asyncHandler(controller.findAll));

  //:id
  router.get("/:id", isAdminMiddleware, asyncHandler(controller.findOne));
  router.patch("/:id", asyncHandler(controller.update));
  router.delete("/:id", isAdminMiddleware, asyncHandler(controller.delete));

  return router;
}

export const userRouter = createUserRouter();
