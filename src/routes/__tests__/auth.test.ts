import express from "express";
import mongoose from "mongoose";
import pino from "pino";
import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";


import { app } from "../../app.js";
import { connectDatabase } from "../../config/database.js";
import { SessionModel, UserModel } from "../../models/index.js";
import { openApiDocument } from "../../openapi.js";
import { createLoggingMiddleware } from "../../logger/middleware.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { createAuthRouter } from "../auth.js";

import { verifyRefreshToken } from "../../utils/jwt.js";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.JWT_REFRESH_EXPIRES_IN = "30d";

interface IAuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
  };
}


const testGoogleProfile = {
  authProviderUserId: "google-user-123",
  email: "customer@example.com",
  name: "Customer Example",
  avatarUrl: "https://example.com/avatar.png",
  emailVerified: true
};

function createTestApp() {
  const app = express();
  const testLogger = pino({ level: "silent" });

  app.set("trust proxy", 1);
  app.use(createLoggingMiddleware(testLogger));
  app.use(express.json());
  app.use(
    "/api/auth",
    createAuthRouter({
      verifyGoogleIdToken: async (idToken: string) => {
        assert.equal(idToken, "valid-google-token");
        return testGoogleProfile;
      },
      jwtSecret: "test-secret",
      jwtExpiresIn: "1h"
    })
  );
  app.get("/openapi.json", (_request, response) => response.json(openApiDocument));
  app.use(errorHandler);

  return app;
}

describe("Google auth flow", () => {
  before(async () => {
    await connectDatabase();
  });

  after(async () => {
    await mongoose.disconnect();
  });

  afterEach(async () => {
    await Promise.all([
      UserModel.deleteMany({ authProviderUserId: testGoogleProfile.authProviderUserId }),
      SessionModel.deleteMany({})
    ]);
  });

  test("creates a user on first Google sign-up and logs in on the second request", async () => {
    const app = createTestApp();
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Unable to determine test server address");
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      const firstResponse = await fetch(`${baseUrl}/api/auth/google`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ idToken: "valid-google-token" })
      });

      assert.equal(firstResponse.status, 201);

      const firstBody = (await firstResponse.json()) as {
        isNewUser: boolean;
        user: { email: string; authProvider: string };
        accessToken: string;
      };

      assert.equal(firstBody.isNewUser, true);
      assert.equal(firstBody.user.email, testGoogleProfile.email);
      assert.equal(firstBody.user.authProvider, "google");
      assert.equal(typeof firstBody.accessToken, "string");

      const secondResponse = await fetch(`${baseUrl}/api/auth/google`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ idToken: "valid-google-token" })
      });

      assert.equal(secondResponse.status, 200);

      const secondBody = (await secondResponse.json()) as {
        isNewUser: boolean;
        user: { email: string; authProvider: string };
      };

      assert.equal(secondBody.isNewUser, false);
      assert.equal(secondBody.user.email, testGoogleProfile.email);
      assert.equal(secondBody.user.authProvider, "google");

      const storedUsers = await UserModel.find({ email: testGoogleProfile.email });
      assert.equal(storedUsers.length, 1);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  test("exposes the OpenAPI document with the Google auth path", async () => {
    const app = createTestApp();
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Unable to determine test server address");
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/openapi.json`);
      assert.equal(response.status, 200);

      const body = (await response.json()) as { paths: Record<string, unknown> };
      assert.ok(body.paths["/api/auth/google"]);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  test("revokes a Google session created from a different IP", async () => {
    const app = createTestApp();
    const server = app.listen(0);

    try {
      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("Unable to determine test server address");
      }

      const baseUrl = `http://127.0.0.1:${address.port}`;

      const firstResponse = await fetch(`${baseUrl}/api/auth/google`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "5.5.5.5" },
        body: JSON.stringify({ idToken: "valid-google-token" })
      });
      assert.equal(firstResponse.status, 201);
      const first = (await firstResponse.json()) as { accessToken: string };

      const secondResponse = await fetch(`${baseUrl}/api/auth/google`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "6.6.6.6" },
        body: JSON.stringify({ idToken: "valid-google-token" })
      });
      assert.equal(secondResponse.status, 200);
      const second = (await secondResponse.json()) as { accessToken: string };

      const revoked = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { authorization: `Bearer ${first.accessToken}` }
      });
      assert.equal(revoked.status, 401);

      const active = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { authorization: `Bearer ${second.accessToken}` }
      });
      assert.equal(active.status, 200);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});


describe("session IP scoping", () => {
  let baseUrl: string;
  let server: ReturnType<typeof app.listen>;

  before(async () => {
    await connectDatabase();
    server = app.listen(0);
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

  async function registerFromIp(email: string, ip: string): Promise<IAuthResponse> {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password: "secure-password", name: "IP Test" })
    });
    assert.equal(response.status, 201);
    return (await response.json()) as IAuthResponse;
  }

  test("a login from a new IP revokes sessions from other IPs", async () => {
    const email = "ip-rotate@example.com";
    const first = await registerFromIp(email, "1.1.1.1");

    const firstProfile = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${first.accessToken}` }
    });
    assert.equal(firstProfile.status, 200);

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "2.2.2.2" },
      body: JSON.stringify({ email, password: "secure-password" })
    });
    assert.equal(loginResponse.status, 200);
    const second = (await loginResponse.json()) as IAuthResponse;

    // The original IP's access token is rejected immediately.
    const revokedProfile = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${first.accessToken}` }
    });
    assert.equal(revokedProfile.status, 401);

    // The original refresh token can no longer be exchanged.
    const revokedRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: first.refreshToken })
    });
    assert.equal(revokedRefresh.status, 401);

    // The new IP's session remains valid.
    const activeProfile = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${second.accessToken}` }
    });
    assert.equal(activeProfile.status, 200);

    assert.equal(await SessionModel.countDocuments({}), 1);
  });

  test("keeps same-IP sessions valid so multiple tabs can share a login", async () => {
    const email = "ip-same@example.com";
    const first = await registerFromIp(email, "3.3.3.3");

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "3.3.3.3" },
      body: JSON.stringify({ email, password: "secure-password" })
    });
    assert.equal(loginResponse.status, 200);
    const second = (await loginResponse.json()) as IAuthResponse;

    for (const token of [first.accessToken, second.accessToken]) {
      const profile = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(profile.status, 200);
    }

    assert.equal(await SessionModel.countDocuments({}), 2);
  });
});


describe.skip("authentication API", () => {
  let baseUrl: string;
  const server = app.listen(0);

  before(async () => {
    await connectDatabase();
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

  test("registers, authenticates, refreshes, and logs out a local user", async () => {
    const registerResponse = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "auth-integration-test"
      },
      body: JSON.stringify({
        email: "Customer@Example.com",
        password: "secure-password",
        name: "Customer Example"
      })
    });

    assert.equal(registerResponse.status, 201);
    const registered = (await registerResponse.json()) as IAuthResponse;
    assert.equal(registered.user.email, "customer@example.com");
    assert.ok(registered.accessToken);
    assert.ok(registered.refreshToken);

    const storedUser = await UserModel.findOne({
      email: "customer@example.com"
    }).select("+password");
    assert.ok(storedUser?.password);
    assert.notEqual(storedUser.password, "secure-password");
    assert.equal(await storedUser.comparePassword("secure-password"), true);
    const session = await SessionModel.findOne({ userId: storedUser._id });
    assert.ok(session);
    const refreshTokenPayload = verifyRefreshToken(registered.refreshToken);
    assert.equal(
      session.expiresAt.getTime(),
      refreshTokenPayload.expiresAt.getTime()
    );
    assert.ok(
      session.expiresAt.getTime() - Date.now() > 29 * 24 * 60 * 60 * 1000
    );

    const profileResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${registered.accessToken}` }
    });
    assert.equal(profileResponse.status, 200);

    const invalidLoginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "customer@example.com",
        password: "wrong-password"
      })
    });
    assert.equal(invalidLoginResponse.status, 401);

    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "customer@example.com",
        password: "secure-password"
      })
    });
    assert.equal(loginResponse.status, 200);
    const loggedIn = (await loginResponse.json()) as IAuthResponse;

    const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: loggedIn.refreshToken })
    });
    assert.equal(refreshResponse.status, 200);
    assert.ok(
      ((await refreshResponse.json()) as { accessToken: string }).accessToken
    );

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: loggedIn.refreshToken })
    });
    assert.equal(logoutResponse.status, 204);

    const reusedRefreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: loggedIn.refreshToken })
    });
    assert.equal(reusedRefreshResponse.status, 401);
  });

  test("rejects duplicate registration and invalid access tokens", async () => {
    const request = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "duplicate@example.com",
        password: "secure-password",
        name: "Duplicate Example"
      })
    };

    assert.equal(
      (await fetch(`${baseUrl}/api/auth/register`, request)).status,
      201
    );
    assert.equal(
      (await fetch(`${baseUrl}/api/auth/register`, request)).status,
      409
    );
    assert.equal(
      (
        await fetch(`${baseUrl}/api/auth/me`, {
          headers: { authorization: "Bearer invalid" }
        })
      ).status,
      401
    );
  });

  test("documents every authentication endpoint in OpenAPI", async () => {
    const response = await fetch(`${baseUrl}/openapi.json`);
    const document = (await response.json()) as {
      paths: Record<string, unknown>;
    };

    assert.equal(response.status, 200);
    for (const path of ["register", "login", "refresh", "logout", "me"]) {
      assert.ok(document.paths[`/api/auth/${path}`]);
    }
  });
});
