import mongoose from "mongoose";
import type { Request } from "express";

import { getRedisClient } from "../config/redis.js";
import { SessionModel, type SessionDocument } from "../models/index.js";
import type { UserDocument } from "../models/user.js";
import { generateRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { logger } from "../logger/index.js";

export interface ICreatedSession {
  refreshToken: string;
  sessionId: string;
}

interface ICachedSession {
  userId: string;
  expiresAt: number;
}

type ISessionRequest = Pick<Request, "ip" | "header">;

const SESSION_CACHE_PREFIX = "session:";

/** Upper bound for how long a validated session stays cached, regardless of its real lifetime. */
const MAX_SESSION_CACHE_TTL_SECONDS = Number(
  process.env.SESSION_CACHE_TTL_SECONDS ?? 300
);

function sessionCacheKey(sessionId: string): string {
  return `${SESSION_CACHE_PREFIX}${sessionId}`;
}

/**
 * Reads a validated session snapshot from Redis. Returns null on a miss and,
 * because the cache is a pure optimization, also on any Redis failure so the
 * caller transparently falls back to MongoDB.
 */
async function readCachedSession(
  sessionId: string,
  userId: string
): Promise<SessionDocument | null> {
  let raw: string | null;

  try {
    const client = await getRedisClient();
    raw = await client.get(sessionCacheKey(sessionId));
  } catch (error) {
    logger.warn({ err: error, sessionId }, "Session cache read failed; falling back to MongoDB");
    return null;
  }

  if (raw === null) {
    return null;
  }

  const cached = JSON.parse(raw) as ICachedSession;

  if (cached.userId !== userId || cached.expiresAt <= Date.now()) {
    await invalidateSessionCache(sessionId);
    return null;
  }

  return SessionModel.hydrate({
    _id: sessionId,
    userId,
    expiresAt: new Date(cached.expiresAt)
  });
}

/** Best-effort write of a validated session to Redis; failures are logged but never thrown. */
async function writeCachedSession(session: SessionDocument): Promise<void> {
  const expiresAtMs = session.expiresAt.getTime();
  const ttlSeconds = Math.min(
    Math.floor((expiresAtMs - Date.now()) / 1000),
    MAX_SESSION_CACHE_TTL_SECONDS
  );

  if (ttlSeconds <= 0) {
    return;
  }

  const payload: ICachedSession = {
    userId: session.userId.toString(),
    expiresAt: expiresAtMs
  };

  try {
    const client = await getRedisClient();
    await client.set(sessionCacheKey(session._id.toString()), JSON.stringify(payload), {
      EX: ttlSeconds
    });
  } catch (error) {
    logger.warn(
      { err: error, sessionId: session._id.toString() },
      "Session cache write failed"
    );
  }
}

/** Removes a session from the Redis cache. Best-effort: failures are logged but never thrown. */
export async function invalidateSessionCache(sessionId: string): Promise<void> {
  try {
    const client = await getRedisClient();
    await client.del(sessionCacheKey(sessionId));
  } catch (error) {
    logger.warn({ err: error, sessionId }, "Session cache invalidation failed");
  }
}

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
  const filter = {
    userId,
    ipAddress: { $ne: currentIp ?? null }
  };

  const revokedSessions = await SessionModel.find(filter).select("_id").lean();
  const { deletedCount } = await SessionModel.deleteMany(filter);

  await Promise.all(
    revokedSessions.map((session) => invalidateSessionCache(session._id.toString()))
  );

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

  const cached = await readCachedSession(sessionId, userId);

  if (cached) {
    return cached;
  }

  const session = await SessionModel.findOne({
    _id: sessionId,
    userId,
    expiresAt: { $gt: new Date() }
  });

  if (session) {
    await writeCachedSession(session);
  }

  return session;
}
