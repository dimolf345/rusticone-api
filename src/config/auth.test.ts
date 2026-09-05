import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { NextFunction, Request, Response } from "express";

import {
  REFRESH_COOKIE_NAME,
  getAllowedFrontendOrigins,
  getClearRefreshCookieOptions,
  getRefreshCookieOptions
} from "./auth.js";
import { requireTrustedAuthOrigin } from "../middleware/authOrigin.middleware.js";
import { parseRefreshCookie } from "../utils/cookies.js";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

function createRequest(headers: Record<string, string> = {}): Request {
  return {
    header(name: string) {
      return headers[name.toLowerCase()];
    },
    headers
  } as unknown as Request;
}

test("uses secure cross-site refresh cookie options in production", () => {
  process.env.NODE_ENV = "production";
  process.env.JWT_REFRESH_EXPIRES_IN = "7d";
  const expiresAt = new Date("2026-09-01T00:00:00.000Z");

  assert.equal(REFRESH_COOKIE_NAME, "refreshToken");
  assert.deepEqual(getRefreshCookieOptions(expiresAt), {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    expires: expiresAt
  });
  assert.deepEqual(getClearRefreshCookieOptions(), {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/api/auth"
  });
});

test("uses local HTTP refresh cookie options outside production", () => {
  process.env.NODE_ENV = "development";
  process.env.JWT_REFRESH_EXPIRES_IN = "30m";

  const options = getRefreshCookieOptions();

  assert.equal(options.secure, false);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.maxAge, 30 * 60 * 1000);
});

test("supports refresh durations of at least one second and rejects invalid durations", () => {
  for (const [duration, milliseconds] of [
    ["1000ms", 1000],
    ["45s", 45_000],
    ["10m", 600_000],
    ["2h", 7_200_000],
    ["3d", 259_200_000]
  ] as const) {
    process.env.JWT_REFRESH_EXPIRES_IN = duration;
    assert.equal(getRefreshCookieOptions().maxAge, milliseconds);
  }

  process.env.JWT_REFRESH_EXPIRES_IN = "tomorrow";
  assert.throws(getRefreshCookieOptions, /JWT_REFRESH_EXPIRES_IN/);

  process.env.JWT_REFRESH_EXPIRES_IN = "999ms";
  assert.throws(getRefreshCookieOptions, /at least one second/);

  process.env.JWT_REFRESH_EXPIRES_IN = "1500ms";
  assert.throws(getRefreshCookieOptions, /whole number of seconds/);
});

test("parses trimmed exact frontend URL origins", () => {
  process.env.FRONTEND_ORIGINS =
    " https://app.example.com,https://admin.example.com:8443 , https://app.example.com ";

  assert.deepEqual(getAllowedFrontendOrigins(), [
    "https://app.example.com",
    "https://admin.example.com:8443"
  ]);

  process.env.FRONTEND_ORIGINS = "https://app.example.com/path";
  assert.throws(getAllowedFrontendOrigins, /FRONTEND_ORIGINS/);
});

test("requires frontend origins in production", () => {
  process.env.NODE_ENV = "production";
  delete process.env.FRONTEND_ORIGINS;

  assert.throws(getAllowedFrontendOrigins, /FRONTEND_ORIGINS/);
});

test("parses and safely decodes the named refresh cookie", () => {
  assert.equal(
    parseRefreshCookie(
      createRequest({ cookie: `theme=dark; ${REFRESH_COOKIE_NAME}=signed%20token; other=value` })
    ),
    "signed token"
  );
  assert.equal(parseRefreshCookie(createRequest({ cookie: "theme=dark" })), null);
  assert.equal(
    parseRefreshCookie(createRequest({ cookie: `${REFRESH_COOKIE_NAME}=%E0%A4%A` })),
    null
  );
});

test("accepts an exactly trusted production auth origin", () => {
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_ORIGINS = "https://app.example.com";
  let nextArgument: unknown = Symbol("not called");

  requireTrustedAuthOrigin(
    createRequest({ origin: "https://app.example.com" }),
    {} as Response,
    ((error?: unknown) => {
      nextArgument = error;
    }) as NextFunction
  );

  assert.equal(nextArgument, undefined);
});

test("rejects missing and untrusted production auth origins", () => {
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_ORIGINS = "https://app.example.com";

  for (const request of [
    createRequest(),
    createRequest({ origin: "https://evil.example.com" })
  ]) {
    let nextArgument: unknown;
    requireTrustedAuthOrigin(
      request,
      {} as Response,
      ((error?: unknown) => {
        nextArgument = error;
      }) as NextFunction
    );

    assert.equal((nextArgument as { statusCode: number }).statusCode, 403);
  }
});

test("allows auth requests without origin outside production", () => {
  process.env.NODE_ENV = "test";
  let nextArgument: unknown = Symbol("not called");

  requireTrustedAuthOrigin(
    createRequest(),
    {} as Response,
    ((error?: unknown) => {
      nextArgument = error;
    }) as NextFunction
  );

  assert.equal(nextArgument, undefined);
});

test("CORS credentials are limited to exact configured origins", async () => {
  process.env.FRONTEND_ORIGINS = "https://app.example.com";
  const { app } = await import("../app.js");
  const server = app.listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/api/health`;

    const trustedResponse = await fetch(url, {
      headers: { origin: "https://app.example.com" }
    });
    assert.equal(
      trustedResponse.headers.get("access-control-allow-origin"),
      "https://app.example.com"
    );
    assert.equal(trustedResponse.headers.get("access-control-allow-credentials"), "true");

    const untrustedResponse = await fetch(url, {
      headers: { origin: "https://evil.example.com" }
    });
    assert.equal(untrustedResponse.headers.get("access-control-allow-origin"), null);
    assert.equal(untrustedResponse.headers.get("access-control-allow-credentials"), null);

    const apiResponse = await fetch(url);
    assert.equal(apiResponse.status, 200);
    assert.equal(apiResponse.headers.get("access-control-allow-origin"), null);
    assert.equal(apiResponse.headers.get("access-control-allow-credentials"), null);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
