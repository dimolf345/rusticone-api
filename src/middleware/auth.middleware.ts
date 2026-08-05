import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken, type AccessTokenPayload } from "../utils/jwt.js";

export interface AuthenticatedRequest extends Request {
  user: AccessTokenPayload;
}

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
    (request as AuthenticatedRequest).user = verifyAccessToken(
      authorization.slice(7)
    );
    next();
  } catch {
    response
      .status(401)
      .json({ message: "Access token is invalid or expired" });
  }
}
