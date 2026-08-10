import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "../utils/jwt.js";
import { AuthenticatedRequest } from "../interfaces/auth/index.js";


export function authMiddleware(
  request: Request,
  response: Response,
  next: NextFunction
): void {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    response.status(401).json({ message: "Access token is required" });
    return;
  }

  try {
    const token = authorization.slice(7);
    (request as AuthenticatedRequest).user = verifyAccessToken(token);
  } catch {
    response
      .status(401)
      .json({ message: "Access token is invalid or expired" });
    return;
  }

  next();
}
