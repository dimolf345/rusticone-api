import mongoose from "mongoose";
import type { Request } from "express";

import { SessionModel, type SessionDocument } from "../models/index.js";
import type { UserDocument } from "../models/user.js";
import { generateRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { logger } from "../logger/index.js";

export interface ICreatedSession {
  refreshToken: string;
  sessionId: string;
}

type ISessionRequest = Pick<Request, "ip" | "header">;

/**
 * Creates a persisted refresh-token session for the user and returns the
 * refresh token together with the session id used as the access token `sid`.
 */
export async function createSession(
  request: ISessionRequest,
  user: UserDocument
): Promise<ICreatedSession> {
  const refreshToken = generateRefreshToken(user);
  const { expiresAt } = verifyRefreshToken(refreshToken);

  const session = await SessionModel.create({
    userId: user._id,
    refreshToken,
    userAgent: request.header("user-agent"),
    ipAddress: request.ip,
    expiresAt
  });

  return { refreshToken, sessionId: session._id.toString() };
}

/**
 * Removes every session for the user that originated from a different IP than
 * the current login, so a login from a new location invalidates older ones.
 */
export async function revokeSessionsFromOtherIps(
  userId: mongoose.Types.ObjectId | string,
  currentIp: string | undefined
): Promise<number> {
  const { deletedCount } = await SessionModel.deleteMany({
    userId,
    ipAddress: { $ne: currentIp ?? null }
  });

  if (deletedCount > 0) {
    logger.info(
      { userId: userId.toString(), currentIp, revoked: deletedCount },
      "Revoked sessions from other IPs"
    );
  }

  return deletedCount;
}

/**
 * Returns the active session bound to the access token, or null when it has
 * been revoked or expired.
 */
export async function findValidSession(
  sessionId: string,
  userId: string
): Promise<SessionDocument | null> {
  if (!mongoose.isValidObjectId(sessionId) || !mongoose.isValidObjectId(userId)) {
    return null;
  }

  return SessionModel.findOne({
    _id: sessionId,
    userId,
    expiresAt: { $gt: new Date() }
  });
}
