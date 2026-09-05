import { createHash } from "node:crypto";

import mongoose from "mongoose";
import type { Request } from "express";

import { getRedisClient } from "../config/redis.js";
import { SessionModel, type SessionDocument } from "../models/index.js";
import type { UserDocument } from "../models/user.js";
import {
  generateNextRefreshToken,
  generateRefreshToken,
  verifyRefreshToken
} from "../utils/jwt.js";
import { logger } from "../logger/index.js";

export interface ICreatedSession {
  refreshToken: string;
  sessionId: string;
}

export interface IRotatedSession {
  status: "rotated";
  refreshToken: string;
  sessionId: string;
  expiresAt: Date;
}

export interface IRefreshTokenReuse {
  status: "reuse";
  sessionId: string;
}

export interface IInvalidRefreshToken {
  status: "invalid";
}

export type IRefreshTokenRotationResult =
  | IRotatedSession
  | IRefreshTokenReuse
  | IInvalidRefreshToken;

interface ICachedSession {
  sessionId: string;
  userId: string;
  expiresAt: number;
}

type ISessionRequest = Pick<Request, "ip" | "header">;

const SESSION_CACHE_PREFIX = "session:";
const DEFAULT_AUTH_CACHE_TIMEOUT_MS = 100;
const configuredAuthCacheTimeoutMs = Number(process.env.AUTH_SESSION_CACHE_TIMEOUT_MS);
const AUTH_CACHE_TIMEOUT_MS =
  Number.isFinite(configuredAuthCacheTimeoutMs) && configuredAuthCacheTimeoutMs > 0
    ? configuredAuthCacheTimeoutMs
    : DEFAULT_AUTH_CACHE_TIMEOUT_MS;
const DEFAULT_AUTH_CACHE_COOLDOWN_MS = 1_000;
const configuredAuthCacheCooldownMs = Number(process.env.AUTH_SESSION_CACHE_COOLDOWN_MS);
const AUTH_CACHE_COOLDOWN_MS =
  Number.isFinite(configuredAuthCacheCooldownMs) && configuredAuthCacheCooldownMs > 0
    ? configuredAuthCacheCooldownMs
    : DEFAULT_AUTH_CACHE_COOLDOWN_MS;
let authCacheCooldownUntil = 0;
let authCacheOperationInFlight: symbol | undefined;

/** Upper bound for how long a validated session stays cached, regardless of its real lifetime. */
const MAX_SESSION_CACHE_TTL_SECONDS = Number(
  process.env.SESSION_CACHE_TTL_SECONDS ?? 300
);

function sessionCacheKey(sessionId: string): string {
  return `${SESSION_CACHE_PREFIX}${sessionId}`;
}

async function runAuthCacheOperation<T>(
  operation: () => Promise<T>
): Promise<T | undefined> {
  if (authCacheOperationInFlight || Date.now() < authCacheCooldownUntil) {
    return undefined;
  }

  const operationIdentity = Symbol("auth-cache-operation");
  authCacheOperationInFlight = operationIdentity;
  const operationPromise = Promise.resolve().then(operation);
  const clearInFlightOperation = () => {
    if (authCacheOperationInFlight === operationIdentity) {
      authCacheOperationInFlight = undefined;
    }
  };
  void operationPromise.then(clearInFlightOperation, clearInFlightOperation);
  let timeout: NodeJS.Timeout | undefined;

  try {
    const result = await Promise.race([
      operationPromise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Authentication cache operation timed out")),
          AUTH_CACHE_TIMEOUT_MS
        );
      })
    ]);
    authCacheCooldownUntil = 0;
    return result;
  } catch (error) {
    authCacheCooldownUntil = Date.now() + AUTH_CACHE_COOLDOWN_MS;
    throw error;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

/**
 * Reads and validates the Redis hint. MongoDB remains authoritative, so this
 * function never returns a session that could authorize a request.
 */
async function readCachedSession(
  sessionId: string,
  userId: string
): Promise<void> {
  let raw: string | null | undefined;

  try {
    raw = await runAuthCacheOperation(async () => {
      const client = await getRedisClient();
      return client.get(sessionCacheKey(sessionId));
    });
  } catch (error) {
    logger.warn({ err: error, sessionId }, "Session cache read failed; falling back to MongoDB");
    return;
  }

  if (raw == null) {
    return;
  }

  let cached: unknown;

  try {
    cached = JSON.parse(raw);
  } catch {
    await invalidateSessionCache(sessionId);
    return;
  }

  if (!isValidCachedSession(cached, sessionId, userId)) {
    await invalidateSessionCache(sessionId);
  }
}

function isValidCachedSession(
  cached: unknown,
  sessionId: string,
  userId: string
): cached is ICachedSession {
  if (cached === null || typeof cached !== "object" || Array.isArray(cached)) {
    return false;
  }

  const candidate = cached as Record<string, unknown>;

  return (
    typeof candidate.sessionId === "string" &&
    mongoose.isValidObjectId(candidate.sessionId) &&
    candidate.sessionId === sessionId &&
    typeof candidate.userId === "string" &&
    mongoose.isValidObjectId(candidate.userId) &&
    candidate.userId === userId &&
    typeof candidate.expiresAt === "number" &&
    Number.isFinite(candidate.expiresAt) &&
    candidate.expiresAt > Date.now()
  );
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
    sessionId: session._id.toString(),
    userId: session.userId.toString(),
    expiresAt: expiresAtMs
  };

  try {
    await runAuthCacheOperation(async () => {
      const client = await getRedisClient();
      await client.set(sessionCacheKey(session._id.toString()), JSON.stringify(payload), {
        EX: ttlSeconds
      });
    });
  } catch (error) {
    logger.warn(
      { err: error, sessionId: session._id.toString() },
      "Session cache write failed"
    );
  }
}

/** Removes a session from the Redis cache. Best-effort: failures are logged but never thrown. */
async function invalidateSessionCache(sessionId: string): Promise<void> {
  try {
    await runAuthCacheOperation(async () => {
      const client = await getRedisClient();
      await client.del(sessionCacheKey(sessionId));
    });
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
  const sessionId = new mongoose.Types.ObjectId();
  const refreshToken = generateRefreshToken(user, sessionId.toString(), 0);
  const { expiresAt } = verifyRefreshToken(refreshToken);

  const session = await SessionModel.create({
    _id: sessionId,
    userId: user._id,
    refreshTokenHash: hashRefreshToken(refreshToken),
    usedRefreshTokenHashes: [],
    generation: 0,
    userAgent: request.header("user-agent"),
    ipAddress: request.ip,
    expiresAt
  });

  return { refreshToken, sessionId: session._id.toString() };
}

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function rotateRefreshToken(
  token: string
): Promise<IRefreshTokenRotationResult> {
  let payload;

  try {
    payload = verifyRefreshToken(token);
  } catch {
    return { status: "invalid" };
  }

  const currentHash = hashRefreshToken(token);
  const nextGeneration = payload.generation + 1;
  const refreshToken = generateNextRefreshToken(
    payload.userId,
    payload.sid,
    nextGeneration
  );
  const { expiresAt } = verifyRefreshToken(refreshToken);
  const now = new Date();
  const session = await SessionModel.findOneAndUpdate(
    {
      _id: payload.sid,
      userId: payload.userId,
      refreshTokenHash: currentHash,
      generation: payload.generation,
      expiresAt: { $gt: now },
      revokedAt: { $exists: false }
    },
    {
      $push: { usedRefreshTokenHashes: currentHash },
      $set: {
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt
      },
      $inc: { generation: 1 }
    },
    { new: true }
  );

  if (session) {
    await invalidateSessionCache(payload.sid);
    return { status: "rotated", refreshToken, sessionId: payload.sid, expiresAt };
  }

  const reused = await SessionModel.findOneAndUpdate(
    {
      _id: payload.sid,
      userId: payload.userId,
      usedRefreshTokenHashes: currentHash,
      revokedAt: { $exists: false }
    },
    { $set: { revokedAt: now } },
    { new: true }
  );

  if (!reused) {
    return { status: "invalid" };
  }

  await invalidateSessionCache(payload.sid);
  logger.warn(
    { sessionId: payload.sid },
    "Refresh token reuse detected; session family revoked"
  );
  return { status: "reuse", sessionId: payload.sid };
}

export async function revokeSessionByRefreshToken(
  token: string
): Promise<string | null> {
  let payload;

  try {
    payload = verifyRefreshToken(token);
  } catch {
    return null;
  }

  const tokenHash = hashRefreshToken(token);
  const session = await SessionModel.findOneAndUpdate(
    {
      _id: payload.sid,
      userId: payload.userId,
      $or: [
        { refreshTokenHash: tokenHash },
        { usedRefreshTokenHashes: tokenHash }
      ]
    },
    { $set: { revokedAt: new Date() } },
    { new: true }
  );

  if (!session) {
    return null;
  }

  await invalidateSessionCache(payload.sid);
  return payload.sid;
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

  await readCachedSession(sessionId, userId);

  const session = await SessionModel.findOne({
    _id: sessionId,
    userId,
    expiresAt: { $gt: new Date() },
    revokedAt: { $exists: false }
  });

  if (session) {
    await writeCachedSession(session);
  }

  return session;
}
