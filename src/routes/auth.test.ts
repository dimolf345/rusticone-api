import express from "express";
import mongoose from "mongoose";
import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";


import { app } from "../app.js";
import { connectDatabase } from "../config/database.js";
import { SessionModel, UserModel } from "../models/index.js";
import { openApiDocument } from "../openapi.js";
import { createAuthRouter } from "./auth.js";

import { verifyRefreshToken } from "../utils/jwt.js";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.JWT_REFRESH_EXPIRES_IN = "30d";

interface AuthResponse {
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
    await UserModel.deleteMany({ authProviderUserId: testGoogleProfile.authProviderUserId });
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
      server.close();
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
      server.close();
    }
  });
});


describe("authentication API", () => {
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
    const registered = (await registerResponse.json()) as AuthResponse;
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
    const loggedIn = (await loginResponse.json()) as AuthResponse;

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
