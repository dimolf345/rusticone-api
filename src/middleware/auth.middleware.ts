import type { NextFunction, Request, Response } from "express";

import { UnauthorizedError } from "../errors/index.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { AuthenticatedRequest } from "../interfaces/auth/index.js";


export function authMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction
): void {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    next(new UnauthorizedError("Access token is required"));
    return;
  }

  try {
    const token = authorization.slice(7);
    (request as AuthenticatedRequest).user = verifyAccessToken(token);
  } catch {
    next(new UnauthorizedError("Access token is invalid or expired"));
    return;
  }

  next();
}
