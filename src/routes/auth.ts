import { Router } from "express";

import {
  login,
  logout,
  me,
  refreshToken,
  register
} from "../controllers/auth.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/refresh", refreshToken);
authRouter.post("/logout", logout);
authRouter.get("/me", authMiddleware, me);
