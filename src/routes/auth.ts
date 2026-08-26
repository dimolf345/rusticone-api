import { Router } from "express";
import {
  createGoogleAuthController, login,
  logout,
  me,
  refreshToken,
  register
} from "../controllers/auth.controller.js";
import type { IAuthRouterDependencies } from "../interfaces/auth/index.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { requireTrustedAuthOrigin } from "../middleware/authOrigin.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createAuthRouter(dependencies: IAuthRouterDependencies = {}) {
  const router = Router();

  router.post("/google", asyncHandler(createGoogleAuthController(dependencies)));
  router.post("/register", asyncHandler(register));
  router.post("/login", asyncHandler(login));
  router.post("/refresh", requireTrustedAuthOrigin, asyncHandler(refreshToken));
  router.post("/logout", requireTrustedAuthOrigin, asyncHandler(logout));
  router.get("/me", authMiddleware, asyncHandler(me));

  return router;
}

export const authRouter = createAuthRouter();



