import { Router } from "express";

import { UserController } from "../controllers/user.controller.js";

export function createUserRouter(controller = new UserController()) {
  const router = Router();

  router.post("/", controller.createOne);
  router.get("/", controller.findAll);

  //:id
  router.get("/:id", controller.findOne);
  router.patch("/:id", controller.update);
  router.delete("/:id", controller.delete);

  return router;
}

export const userRouter = createUserRouter();
