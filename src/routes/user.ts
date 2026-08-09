import { Router } from "express";

import { UserController } from "../controllers/user.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { isAdminMiddleware } from "../middleware/is-admin.middleware.js";

export function createUserRouter(controller = new UserController()) {
  const router = Router();

  router.use(authMiddleware);

  router.post("/", isAdminMiddleware, controller.createOne);
  router.get("/", isAdminMiddleware, controller.findAll);

  //:id
  router.get("/:id", isAdminMiddleware, controller.findOne);
  router.patch("/:id", controller.update);
  router.delete("/:id", isAdminMiddleware, controller.delete);

  return router;
}

export const userRouter = createUserRouter();
