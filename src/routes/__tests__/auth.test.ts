import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";

import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import pino from "pino";

import { connectDatabase } from "../../config/database.js";
import { redaction } from "../../logger/redactor.js";
import { createLoggingMiddleware } from "../../logger/middleware.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { BadRequestError, InternalServerError } from "../../errors/index.js";
import { SessionModel, UserModel } from "../../models/index.js";
import { openApiDocument } from "../../openapi.js";
import { createAuthRouter } from "../auth.js";
import type { IAuthRouterDependencies } from "../../interfaces/auth/index.js";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.JWT_ACCESS_EXPIRES_IN = "15m";
process.env.JWT_REFRESH_EXPIRES_IN = "30d";

interface IAuthResponse {
  accessToken: string;
  user: {
    id: string;
    email: string;
    authProvider: string;
  };
  refreshToken?: never;
  isNewUser?: boolean;
  message?: string;
}

interface IErrorResponse {
  success: false;
  status: "fail";
  message: string;
}

const testGoogleProfile = {
  authProviderUserId: "google-user-123",
  email: "google@example.com",
  name: "Google Customer",
  avatarUrl: "https://example.com/avatar.png",
  emailVerified: true
};

function createTestApp(dependencies: IAuthRouterDependencies = {
  verifyGoogleIdToken: async (idToken: string) => {
    assert.equal(idToken, "valid-google-token");
    return testGoogleProfile;
  }
}) {
  const testApp = express();

  testApp.set("trust proxy", 1);
  testApp.use(createLoggingMiddleware(pino({ level: "silent" })));
  testApp.use(express.json());
  testApp.use(
    "/api/auth",
    createAuthRouter(dependencies)
  );
  testApp.use(errorHandler);

  return testApp;
}

function getSetCookie(response: globalThis.Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? [];
  const value = values[0] ?? response.headers.get("set-cookie");

  assert.ok(value, "response must include Set-Cookie");
  return value;
}

function cookieHeader(setCookie: string): string {
  return setCookie.split(";", 1)[0];
}

function cookieValue(setCookie: string): string {
  const value = cookieHeader(setCookie).split("=", 2)[1];
  assert.ok(value);
  return decodeURIComponent(value);
}

function assertRefreshCookie(setCookie: string): void {
  assert.match(setCookie, /^refreshToken=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\/api\/auth/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Max-Age=2592000/i);
  assert.match(setCookie, /Expires=/i);
}

function assertNoRefreshToken(body: object): void {
  assert.equal("refreshToken" in body, false);
}

test("documents the cookie-based authentication contract in OpenAPI", () => {
  const { paths, components } = openApiDocument;
  const refreshCookie = components.securitySchemes.refreshCookie;
  const getHeaderSchemaType = (header: { $ref: string }) => {
    const name = header.$ref.split("/").at(-1) as keyof typeof components.headers;
    return components.headers[name].schema.type;
  };

  assert.deepEqual(refreshCookie, {
    type: "apiKey",
    in: "cookie",
    name: "refreshToken"
  });
  assert.deepEqual(components.securitySchemes.bearerAuth, {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT"
  });

  for (const path of ["register", "login"] as const) {
    const operation = paths[`/api/auth/${path}`].post;
    const success = operation.responses[path === "register" ? 201 : 200];
    const schema = success.content["application/json"].schema;

    assert.equal(schema.$ref, "#/components/schemas/AuthResponse");
    assert.equal("refreshToken" in components.schemas.AuthResponse.properties, false);
    assert.equal(getHeaderSchemaType(success.headers["Set-Cookie"]), "string");
  }

  const registerSchema = paths["/api/auth/register"].post.requestBody
    .content["application/json"].schema;
  assert.deepEqual(registerSchema.required, ["email", "password", "name"]);
  assert.equal(registerSchema.properties.password.minLength, 8);
  assert.equal(registerSchema.properties.name.minLength, 1);
  assert.equal(registerSchema.properties.name.pattern, "\\S");

  const loginSchema = paths["/api/auth/login"].post.requestBody
    .content["application/json"].schema;
  assert.deepEqual(loginSchema.required, ["email", "password"]);
  assert.equal("name" in loginSchema.properties, false);
  assert.equal(loginSchema.properties.password.minLength, 1);

  const googleCreated = paths["/api/auth/google"].post.responses[201];
  assert.equal(
    paths["/api/auth/google"].post.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/GoogleAuthResponse"
  );
  assert.equal(
    googleCreated.content["application/json"].schema.$ref,
    "#/components/schemas/GoogleAuthResponse"
  );
  assert.equal(getHeaderSchemaType(googleCreated.headers["Set-Cookie"]), "string");
  assert.equal(
    "refreshToken" in components.schemas.GoogleAuthResponse.properties,
    false
  );

  const refresh = paths["/api/auth/refresh"].post;
  assert.equal("requestBody" in refresh, false);
  assert.deepEqual(refresh.security, [{ refreshCookie: [] }]);
  assert.deepEqual(
    refresh.responses[200].content["application/json"].schema.required,
    ["accessToken"]
  );
  assert.deepEqual(
    Object.keys(refresh.responses[200].content["application/json"].schema.properties),
    ["accessToken"]
  );
  assert.ok(refresh.responses[200].headers["Set-Cookie"]);
  assert.ok(refresh.responses[401].headers["Set-Cookie"]);

  const logout = paths["/api/auth/logout"].post;
  assert.equal("requestBody" in logout, false);
  assert.deepEqual(logout.security, [{ refreshCookie: [] }, {}]);
  assert.ok(logout.responses[204].headers["Set-Cookie"]);
  assert.ok(logout.responses[500]);

  const me = paths["/api/auth/me"].get;
  assert.deepEqual(me.security, [{ bearerAuth: [] }]);
  assert.equal(
    me.responses[200].content["application/json"].schema.$ref,
    "#/components/schemas/UserResponse"
  );
  assert.ok(me.responses[401]);
  assert.ok(me.responses[404]);

  assert.ok(paths["/api/auth/register"].post.responses[400]);
  assert.ok(paths["/api/auth/register"].post.responses[409]);
  assert.ok(paths["/api/auth/login"].post.responses[400]);
  assert.ok(paths["/api/auth/login"].post.responses[401]);
  assert.ok(paths["/api/auth/google"].post.responses[400]);
  assert.ok(paths["/api/auth/google"].post.responses[409]);
  assert.ok(paths["/api/auth/google"].post.responses[500]);
  assert.ok(paths["/api/auth/refresh"].post.responses[403]);
  assert.ok(paths["/api/auth/logout"].post.responses[403]);
  assert.match(components.headers.RefreshCookie.description, /HttpOnly/i);
  assert.match(components.headers.RefreshCookie.description, /SameSite=None/i);
  assert.match(paths["/api/auth/refresh"].post.description, /credentialed CORS/i);
  assert.match(paths["/api/auth/refresh"].post.description, /exact FRONTEND_ORIGINS/i);
});

test("register rejects a missing or blank name with a typed 400 response", async () => {
  const server = createTestApp().listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");

    for (const name of [undefined, "   "]) {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/auth/register`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "customer@example.com",
            password: "secure-password",
            ...(name === undefined ? {} : { name })
          })
        }
      );
      const body = (await response.json()) as IErrorResponse;

      assert.equal(response.status, 400);
      assert.equal(body.success, false);
      assert.equal(body.status, "fail");
      assert.match(body.message, /name/i);
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("Google verifier BadRequestError remains a typed 400 response", async () => {
  const server = createTestApp({
    verifyGoogleIdToken: async () => {
      throw new BadRequestError("Unable to verify the Google token");
    }
  }).listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/auth/google`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "invalid-google-token" })
      }
    );
    const body = (await response.json()) as IErrorResponse;

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.status, "fail");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

for (const [name, error] of [
  ["generic Error", new Error("Google verification upstream unavailable")],
  ["InternalServerError", new InternalServerError("Google verifier unavailable")]
] as const) {
  test(`Google verifier ${name} propagates to a typed 500 response`, async () => {
    const server = createTestApp({
      verifyGoogleIdToken: async () => {
        throw error;
      }
    }).listen(0);

    try {
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/auth/google`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken: "valid-shape-google-token" })
        }
      );
      const body = (await response.json()) as IErrorResponse;

      assert.equal(response.status, 500);
      assert.equal(body.success, false);
      assert.equal(body.status, "error");
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((closeError) => (closeError ? reject(closeError) : resolve()));
      });
    }
  });
}

test("Google authentication does not mask MongoDB failures", async () => {
  const originalFind = UserModel.find;
  UserModel.find = (() => ({
    limit: async () => {
      throw new Error("Google user lookup database unavailable");
    }
  })) as unknown as typeof UserModel.find;
  const server = createTestApp().listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/auth/google`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "valid-google-token" })
      }
    );

    assert.equal(response.status, 500);
  } finally {
    UserModel.find = originalFind;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

describe("authentication API", () => {
  let baseUrl: string;
  let server: ReturnType<ReturnType<typeof createTestApp>["listen"]>;

  before(async () => {
    await connectDatabase();
    server = createTestApp().listen(0);
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Unable to determine test server address");
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await Promise.all([UserModel.deleteMany({}), SessionModel.deleteMany({})]);
  });

  after(async () => {
    await mongoose.disconnect();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  async function register(
    email = "customer@example.com",
    ip = "1.1.1.1"
  ): Promise<{ body: IAuthResponse; cookie: string }> {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "auth-integration-test",
        "x-forwarded-for": ip
      },
      body: JSON.stringify({ email, password: "secure-password", name: "Customer" })
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as IAuthResponse;
    const cookie = getSetCookie(response);
    assertNoRefreshToken(body);
    assertRefreshCookie(cookie);
    return { body, cookie };
  }

  async function login(
    email = "customer@example.com",
    ip = "1.1.1.1"
  ): Promise<{ body: IAuthResponse; cookie: string }> {
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password: "secure-password" })
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as IAuthResponse;
    const cookie = getSetCookie(response);
    assertNoRefreshToken(body);
    assertRefreshCookie(cookie);
    return { body, cookie };
  }

  async function refresh(cookie: string) {
    return fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: cookieHeader(cookie) }
    });
  }

  async function profile(accessToken?: string) {
    return fetch(`${baseUrl}/api/auth/me`, {
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined
    });
  }

  test("register, local login, and Google auth set HttpOnly cookies without returning refresh credentials", async () => {
    const registered = await register();
    assert.equal(registered.body.user.email, "customer@example.com");

    const loggedIn = await login();
    assert.ok(loggedIn.body.accessToken);

    const googleResponse = await fetch(`${baseUrl}/api/auth/google`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: "valid-google-token" })
    });
    assert.equal(googleResponse.status, 201);
    const googleBody = (await googleResponse.json()) as IAuthResponse;
    assert.equal(googleBody.isNewUser, true);
    assert.equal(googleBody.user.authProvider, "google");
    assertNoRefreshToken(googleBody);
    assertRefreshCookie(getSetCookie(googleResponse));
  });

  test("register persists a plus-address accepted by request validation", async () => {
    const { body } = await register("customer+quotes@example.com");

    assert.equal(body.user.email, "customer+quotes@example.com");
    assert.equal(
      (await UserModel.findOne({ email: "customer+quotes@example.com" }))?.email,
      "customer+quotes@example.com"
    );
  });

  test("rotates the refresh cookie and returns only a new access token", async () => {
    const { cookie } = await register();
    const oldToken = cookieValue(cookie);
    const response = await refresh(cookie);

    assert.equal(response.status, 200);
    const body = (await response.json()) as { accessToken: string; refreshToken?: never };
    assert.deepEqual(Object.keys(body), ["accessToken"]);
    assert.ok(body.accessToken);

    const replacement = getSetCookie(response);
    assertRefreshCookie(replacement);
    assert.notEqual(cookieValue(replacement), oldToken);

    const session = await SessionModel.findOne({});
    assert.ok(session);
    assert.equal(session.generation, 1);
    assert.ok(Math.abs(session.expiresAt.getTime() - new Date(/Expires=([^;]+)/i.exec(replacement)?.[1] ?? 0).getTime()) < 1000);
  });

  test("rejects an old refresh token and revokes its session family", async () => {
    const { body, cookie } = await register();
    const rotated = await refresh(cookie);
    assert.equal(rotated.status, 200);
    const replacement = getSetCookie(rotated);

    const replay = await refresh(cookie);
    assert.equal(replay.status, 401);
    assert.match(getSetCookie(replay), /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
    assert.equal((await replay.json() as IErrorResponse).status, "fail");

    assert.equal((await refresh(replacement)).status, 401);
    assert.equal((await profile(body.accessToken)).status, 401);
    assert.ok((await SessionModel.findOne({}))?.revokedAt);
  });

  test("allows exactly one of two concurrent refresh requests to succeed", async () => {
    const { cookie } = await register();
    const responses = await Promise.all([refresh(cookie), refresh(cookie)]);

    assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 401]);
    const winner = responses.find(({ status }) => status === 200)!;
    const winnerBody = (await winner.json()) as { accessToken: string };
    const replacement = getSetCookie(winner);
    assert.match(
      getSetCookie(responses.find(({ status }) => status === 401)!),
      /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i
    );
    assert.equal((await profile(winnerBody.accessToken)).status, 401);
    assert.equal((await refresh(replacement)).status, 401);
  });

  test("logout always clears the cookie and immediately invalidates the access sid", async () => {
    const { body, cookie } = await register();
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: cookieHeader(cookie) }
    });

    assert.equal(response.status, 204);
    assert.match(getSetCookie(response), /^refreshToken=;/);
    assert.match(getSetCookie(response), /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
    assert.equal((await profile(body.accessToken)).status, 401);

    const absent = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST" });
    assert.equal(absent.status, 204);
    assert.match(getSetCookie(absent), /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);

    const malformed = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: "refreshToken=not-a-jwt" }
    });
    assert.equal(malformed.status, 204);
    assert.match(getSetCookie(malformed), /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
  });

  test("returns typed 401 and clears cookies for missing, malformed, tampered, expired, and unknown refresh credentials", async () => {
    const expired = jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString(), sid: new mongoose.Types.ObjectId().toString(), generation: 0 },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: -1, jwtid: "expired" }
    );
    const unknown = jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString(), sid: new mongoose.Types.ObjectId().toString(), generation: 0 },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: "1h", jwtid: "unknown" }
    );
    const credentials = [
      undefined,
      "refreshToken=%E0%A4%A",
      "refreshToken=not-a-jwt",
      `refreshToken=${unknown.slice(0, -1)}x`,
      `refreshToken=${expired}`,
      `refreshToken=${unknown}`
    ];

    for (const credential of credentials) {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        headers: credential ? { cookie: credential } : undefined
      });
      assert.equal(response.status, 401);
      assert.match(getSetCookie(response), /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
      const error = (await response.json()) as IErrorResponse;
      assert.equal(error.success, false);
      assert.equal(error.status, "fail");
    }

    assert.equal(await SessionModel.countDocuments({}), 0);
  });

  test("revokes the rotated session family when its user no longer exists", async () => {
    const { cookie } = await register();
    await UserModel.deleteMany({});

    const response = await refresh(cookie);

    assert.equal(response.status, 401);
    assert.match(getSetCookie(response), /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
    assert.ok((await SessionModel.findOne({}))?.revokedAt);
  });

  test("rejects missing, malformed, expired, and revoked access tokens", async () => {
    const { body, cookie } = await register();
    const expired = jwt.sign(
      { userId: new mongoose.Types.ObjectId().toString(), email: "x@example.com", role: "user", sid: new mongoose.Types.ObjectId().toString() },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: -1 }
    );

    assert.equal((await profile()).status, 401);
    assert.equal((await profile("not-a-jwt")).status, 401);
    assert.equal((await profile(expired)).status, 401);

    await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: cookieHeader(cookie) }
    });
    assert.equal((await profile(body.accessToken)).status, 401);
  });

  test("keeps sessions created from different IP addresses active", async () => {
    const first = await register("ip@example.com", "1.1.1.1");
    const second = await login("ip@example.com", "2.2.2.2");

    assert.equal((await profile(first.body.accessToken)).status, 200);
    assert.equal((await profile(second.body.accessToken)).status, 200);
    assert.equal((await refresh(first.cookie)).status, 200);
    assert.equal((await refresh(second.cookie)).status, 200);
    assert.equal(await SessionModel.countDocuments({ revokedAt: { $exists: false } }), 2);
  });
});

function validRefreshCookie(): string {
  const token = jwt.sign(
    {
      userId: new mongoose.Types.ObjectId().toString(),
      sid: new mongoose.Types.ObjectId().toString(),
      generation: 0
    },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: "1h", jwtid: "infrastructure-failure" }
  );
  return `refreshToken=${token}`;
}

test("refresh propagates database failures to centralized 500 handling", async () => {
  const originalFindOneAndUpdate = SessionModel.findOneAndUpdate;
  SessionModel.findOneAndUpdate = (() => {
    throw new Error("refresh database unavailable");
  }) as typeof SessionModel.findOneAndUpdate;
  const server = createTestApp().listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/refresh`, {
      method: "POST",
      headers: { cookie: validRefreshCookie() }
    });
    assert.equal(response.status, 500);
  } finally {
    SessionModel.findOneAndUpdate = originalFindOneAndUpdate;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("logout propagates database failures and still clears the cookie", async () => {
  const originalFindOneAndUpdate = SessionModel.findOneAndUpdate;
  SessionModel.findOneAndUpdate = (() => {
    throw new Error("logout database unavailable");
  }) as typeof SessionModel.findOneAndUpdate;
  const server = createTestApp().listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/logout`, {
      method: "POST",
      headers: { cookie: validRefreshCookie() }
    });
    assert.equal(response.status, 500);
    assert.match(getSetCookie(response), /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
  } finally {
    SessionModel.findOneAndUpdate = originalFindOneAndUpdate;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("production refresh and logout routes enforce exact origins and secure cookies", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalFrontendOrigins = process.env.FRONTEND_ORIGINS;
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_ORIGINS = "https://app.example.com";
  const server = createTestApp().listen(0);

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const productionBaseUrl = `http://127.0.0.1:${address.port}/api/auth`;

    for (const path of ["refresh", "logout"]) {
      const missing = await fetch(`${productionBaseUrl}/${path}`, { method: "POST" });
      assert.equal(missing.status, 403);

      const untrusted = await fetch(`${productionBaseUrl}/${path}`, {
        method: "POST",
        headers: { origin: "https://evil.example.com" }
      });
      assert.equal(untrusted.status, 403);
    }

    const refreshResponse = await fetch(`${productionBaseUrl}/refresh`, {
      method: "POST",
      headers: { origin: "https://app.example.com" }
    });
    assert.equal(refreshResponse.status, 401);
    const refreshCookie = getSetCookie(refreshResponse);
    assert.match(refreshCookie, /HttpOnly/i);
    assert.match(refreshCookie, /Secure/i);
    assert.match(refreshCookie, /SameSite=None/i);
    assert.match(refreshCookie, /Path=\/api\/auth/i);

    const logoutResponse = await fetch(`${productionBaseUrl}/logout`, {
      method: "POST",
      headers: { origin: "https://app.example.com" }
    });
    assert.equal(logoutResponse.status, 204);
    const logoutCookie = getSetCookie(logoutResponse);
    assert.match(logoutCookie, /HttpOnly/i);
    assert.match(logoutCookie, /Secure/i);
    assert.match(logoutCookie, /SameSite=None/i);
    assert.match(logoutCookie, /Path=\/api\/auth/i);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.FRONTEND_ORIGINS = originalFrontendOrigins;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("redacts legacy refresh credentials from request bodies", () => {
  assert.ok(
    typeof redaction === "object" &&
      Array.isArray(redaction.paths) &&
      redaction.paths.includes("body.refreshToken")
  );
});
