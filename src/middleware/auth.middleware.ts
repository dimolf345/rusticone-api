import type { NextFunction, Request, Response } from "express";

import { UnauthorizedError } from "../errors/index.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { findValidSession } from "../services/session.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { IAuthenticatedRequest } from "../interfaces/auth/index.js";


export const authMiddleware = asyncHandler(
  async (request: Request, _response: Response, next: NextFunction): Promise<void> => {
    const authorization = request.header("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Access token is required");
    }

    let payload;

    try {
      payload = verifyAccessToken(authorization.slice(7));
    } catch {
      throw new UnauthorizedError("Access token is invalid or expired");
    }

    const session = await findValidSession(payload.sid, payload.userId);

    if (!session) {
      throw new UnauthorizedError("Session is no longer valid");
    }

    (request as IAuthenticatedRequest).user = payload;
    next();
  }
);
