import { randomUUID } from "node:crypto";

import jwt, { type JwtPayload } from "jsonwebtoken";

import type { UserDocument } from "../models/user.js";

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
}

function getSecret(name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET"): string {
  const secret = process.env[name];

  if (!secret) {
    throw new Error(`${name} environment variable is required`);
  }

  return secret;
}

export function generateAccessToken(user: UserDocument): string {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email },
    getSecret("JWT_ACCESS_SECRET"),
    {
      expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ??
        "15m") as jwt.SignOptions["expiresIn"]
    }
  );
}

export function generateRefreshToken(user: UserDocument): string {
  return jwt.sign(
    { userId: user._id.toString() },
    getSecret("JWT_REFRESH_SECRET"),
    {
      expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ??
        "7d") as jwt.SignOptions["expiresIn"],
      jwtid: randomUUID()
    }
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, getSecret("JWT_ACCESS_SECRET"));

  if (
    !isJwtPayload(payload) ||
    typeof payload.userId !== "string" ||
    typeof payload.email !== "string"
  ) {
    throw new Error("Invalid access token payload");
  }

  return { userId: payload.userId, email: payload.email };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, getSecret("JWT_REFRESH_SECRET"));

  if (!isJwtPayload(payload) || typeof payload.userId !== "string") {
    throw new Error("Invalid refresh token payload");
  }

  return { userId: payload.userId };
}

function isJwtPayload(payload: string | JwtPayload): payload is JwtPayload {
  return typeof payload !== "string";
}
