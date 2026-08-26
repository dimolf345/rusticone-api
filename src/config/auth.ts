import type { CookieOptions } from "express";

export const REFRESH_COOKIE_NAME = "refreshToken";

const REFRESH_COOKIE_PATH = "/api/auth";
const DEFAULT_REFRESH_DURATION = "7d";
const DURATION_MULTIPLIERS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
} as const;

function getRefreshDurationMilliseconds(): number {
  const duration = process.env.JWT_REFRESH_EXPIRES_IN ?? DEFAULT_REFRESH_DURATION;
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration);

  if (!match) {
    throw new Error(
      "JWT_REFRESH_EXPIRES_IN must be a duration using ms, s, m, h, or d"
    );
  }

  const milliseconds = Number(match[1]) * DURATION_MULTIPLIERS[match[2] as keyof typeof DURATION_MULTIPLIERS];

  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new Error("JWT_REFRESH_EXPIRES_IN must be a positive safe duration");
  }

  if (milliseconds < 1000) {
    throw new Error("JWT_REFRESH_EXPIRES_IN must be at least one second");
  }

  if (milliseconds % 1000 !== 0) {
    throw new Error("JWT_REFRESH_EXPIRES_IN must be a whole number of seconds");
  }

  return milliseconds;
}

function getBaseRefreshCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: REFRESH_COOKIE_PATH
  };
}

export function getRefreshCookieOptions(expiresAt?: Date): CookieOptions {
  return {
    ...getBaseRefreshCookieOptions(),
    maxAge: getRefreshDurationMilliseconds(),
    ...(expiresAt ? { expires: expiresAt } : {})
  };
}

export function getClearRefreshCookieOptions(): CookieOptions {
  return getBaseRefreshCookieOptions();
}

export function getAllowedFrontendOrigins(): string[] {
  const configuredOrigins = process.env.FRONTEND_ORIGINS;

  if (!configuredOrigins?.trim()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("FRONTEND_ORIGINS environment variable is required in production");
    }

    return [];
  }

  const origins = configuredOrigins.split(",").map((origin) => origin.trim());

  for (const origin of origins) {
    let parsedOrigin: URL;

    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error(`FRONTEND_ORIGINS contains an invalid origin: ${origin}`);
    }

    if (
      !origin ||
      !["http:", "https:"].includes(parsedOrigin.protocol) ||
      parsedOrigin.origin !== origin
    ) {
      throw new Error(`FRONTEND_ORIGINS contains an invalid origin: ${origin}`);
    }
  }

  return [...new Set(origins)];
}
