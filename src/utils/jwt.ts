import { randomUUID } from "node:crypto";

import jwt, { type JwtPayload } from "jsonwebtoken";

import { IAccessTokenPayload, IRefreshTokenPayload } from "../interfaces/auth/jwt.interface.js";
import type { UserDocument } from "../models/user.js";

function getSecret(name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET"): string {
  const secret = process.env[name];

  if (!secret) {
    throw new Error(`${name} environment variable is required`);
  }

  return secret;
}

export function generateAccessToken(user: UserDocument, sessionId: string): string {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email, role: user.role, sid: sessionId },
    getSecret("JWT_ACCESS_SECRET"),
    {
      expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ??
        "15m") as jwt.SignOptions["expiresIn"]
    }
  );
}

function signRefreshToken(
  userId: string,
  sessionId: string,
  generation: number
): string {
  return jwt.sign(
    { userId, sid: sessionId, generation },
    getSecret("JWT_REFRESH_SECRET"),
    {
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ??
        "7d") as jwt.SignOptions["expiresIn"],
      jwtid: randomUUID()
    }
  );
}

function isObjectId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f\d]{24}$/i.test(value);
}

export function generateRefreshToken(
  user: UserDocument,
  sessionId: string,
  generation: number
): string {
  return signRefreshToken(user._id.toString(), sessionId, generation);
}

export function generateNextRefreshToken(
  userId: string,
  sessionId: string,
  generation: number
): string {
  return signRefreshToken(userId, sessionId, generation);
}

export function verifyAccessToken(token: string): IAccessTokenPayload {
  const payload = jwt.verify(token, getSecret("JWT_ACCESS_SECRET"));

  if (
    !isJwtPayload(payload) ||
    typeof payload.userId !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.sid !== "string"
  ) {
    throw new Error("Invalid access token payload");
  }

  return { userId: payload.userId, email: payload.email, role: payload.role, sid: payload.sid };
}

export function verifyRefreshToken(token: string): IRefreshTokenPayload {
  const payload = jwt.verify(token, getSecret("JWT_REFRESH_SECRET"));

  if (
    !isJwtPayload(payload) ||
    !isObjectId(payload.userId) ||
    !isObjectId(payload.sid) ||
    !Number.isInteger(payload.generation) ||
    payload.generation < 0 ||
    typeof payload.jti !== "string" ||
    payload.jti.length === 0 ||
    typeof payload.exp !== "number" ||
    !Number.isInteger(payload.exp)
  ) {
    throw new Error("Invalid refresh token payload");
  }

  return {
    userId: payload.userId,
    sid: payload.sid,
    generation: payload.generation,
    jti: payload.jti,
    expiresAt: new Date(payload.exp * 1000)
  };
}

function isJwtPayload(payload: string | JwtPayload): payload is JwtPayload {
  return typeof payload !== "string";
}
