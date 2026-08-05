import { Router } from "express";
import {
  createGoogleAuthController, login,
  logout,
  me,
  refreshToken,
  register
} from "../controllers/auth.controller.js";
import type { AuthRouterDependencies } from "../interfaces/auth/index.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

export function createAuthRouter(dependencies: AuthRouterDependencies = {}) {
  const router = Router();

  router.post("/google", createGoogleAuthController(dependencies));
  authRouter.post("/register", register);
  authRouter.post("/login", login);
  authRouter.post("/refresh", refreshToken);
  authRouter.post("/logout", logout);
  authRouter.get("/me", authMiddleware, me);

  return router;
}

export const authRouter = createAuthRouter();



