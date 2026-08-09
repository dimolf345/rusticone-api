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
  router.post("/register", register);
  router.post("/login", login);
  router.post("/refresh", refreshToken);
  router.post("/logout", logout);
  router.get("/me", authMiddleware, me);

  return router;
}

export const authRouter = createAuthRouter();



