import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";

import mongoose from "mongoose";

import { app } from "../app.js";
import { connectDatabase } from "../config/database.js";
import { SessionModel, UserModel } from "../models/index.js";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
  };
}

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
    assert.equal(
      await SessionModel.countDocuments({ userId: storedUser._id }),
      1
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
        password: "secure-password"
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
