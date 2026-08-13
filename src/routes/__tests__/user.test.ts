import assert from "node:assert/strict";
import type { Server } from "node:net";
import { after, afterEach, before, describe, test } from "node:test";

import express, { type Express } from "express";
import mongoose from "mongoose";
import pino from "pino";

import { connectDatabase } from "../config/database.js";
import { createLoggingMiddleware } from "../logger/middleware.js";
import { errorHandler } from "../middleware/errorHandler.js";
import { UserModel } from "../models/user.js";
import { generateAccessToken } from "../utils/jwt.js";
import { createUserRouter } from "./user.js";

const testUserIdPrefix = "user-route-test-";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

function createTestApp(): Express {
  const app = express();
  const testLogger = pino({ level: "silent" });

  app.use(createLoggingMiddleware(testLogger));
  app.use(express.json());
  app.use("/api/users", createUserRouter());
  app.use(errorHandler);
  return app;
}

describe.skip("User routes", () => {
  let server: Server;
  let baseUrl: string;
  let adminAuthHeader: string;

  before(async () => {
    await connectDatabase();

    // Start server once for the entire suite
    const app = createTestApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine test server address");
    }

    baseUrl = `http://127.0.0.1:${address.port}/api/users`;

    // Create a shared admin user and token
    const adminUser = await UserModel.create({
      role: "admin",
      email: "admin-route@example.com",
      username: "admin-route",
      authProvider: "local",
      authProviderUserId: "admin-route-1",
      password: "secure-password",
      emailVerified: true
    });
    adminAuthHeader = `Bearer ${generateAccessToken(adminUser)}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await mongoose.disconnect();
  });

  afterEach(async () => {
    // Keep admin user, clean up test - created users
    await UserModel.deleteMany({
      authProviderUserId: { $regex: `^${testUserIdPrefix}` }
    });
  });

  test("POST /api/users - creates a new user", async () => {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: adminAuthHeader
      },
      body: JSON.stringify({
        role: "customer",
        email: "user-create@example.com",
        name: "Create User",
        authProvider: "google",
        authProviderUserId: `${testUserIdPrefix}create`,
        emailVerified: true
      })
    });

    assert.equal(response.status, 201);
    const created = (await response.json()) as { _id: string; email: string };
    assert.equal(created.email, "user-create@example.com");
    assert.ok(created._id);

    // Verify record in database
    const dbUser = await UserModel.findById(created._id).lean().exec();
    assert.ok(dbUser);
    assert.equal(dbUser.email, "user-create@example.com");
  });

  test("GET /api/users - returns a paginated list of users filtered by query", async () => {
    await UserModel.create({
      role: "customer",
      email: "user-list@example.com",
      name: "List User",
      authProvider: "google",
      authProviderUserId: `${testUserIdPrefix}list`,
      emailVerified: true
    });

    const response = await fetch(`${baseUrl}?email=user-list%40example.com`, {
      headers: { authorization: adminAuthHeader }
    });

    assert.equal(response.status, 200);
    const list = (await response.json()) as {
      data: Array<{ email: string }>;
      pagination: { total: number };
    };
    assert.equal(list.pagination.total, 1);
    assert.equal(list.data[0]?.email, "user-list@example.com");
  });

  test("GET /api/users/:id - fetches a single user by ID", async () => {
    const targetUser = await UserModel.create({
      role: "customer",
      email: "user-get@example.com",
      name: "Get User",
      authProvider: "google",
      authProviderUserId: `${testUserIdPrefix}get`,
      emailVerified: true
    });

    const response = await fetch(`${baseUrl}/${targetUser._id}`, {
      headers: { authorization: adminAuthHeader }
    });

    assert.equal(response.status, 200);
    const fetched = (await response.json()) as { _id: string; email: string };
    assert.equal(fetched._id, targetUser._id.toString());
    assert.equal(fetched.email, "user-get@example.com");
  });

  test("PATCH /api/users/:id - updates an existing user", async () => {
    const targetUser = await UserModel.create({
      role: "customer",
      email: "user-update@example.com",
      name: "Original Name",
      authProvider: "google",
      authProviderUserId: `${testUserIdPrefix}update`,
      emailVerified: true
    });

    const response = await fetch(`${baseUrl}/${targetUser._id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: adminAuthHeader
      },
      body: JSON.stringify({ name: "Updated Name" })
    });

    assert.equal(response.status, 200);
    const updated = (await response.json()) as { name: string };
    assert.equal(updated.name, "Updated Name");

    // Verify update in DB
    const dbUser = await UserModel.findById(targetUser._id).lean().exec();
    assert.equal(dbUser?.name, "Updated Name");
  });

  test("DELETE /api/users/:id - deletes a user and handles subsequent 404", async () => {
    const targetUser = await UserModel.create({
      role: "customer",
      email: "user-delete@example.com",
      name: "Delete User",
      authProvider: "google",
      authProviderUserId: `${testUserIdPrefix}delete`,
      emailVerified: true
    });

    // Execute Delete
    const deleteResponse = await fetch(`${baseUrl}/${targetUser._id}`, {
      method: "DELETE",
      headers: { authorization: adminAuthHeader }
    });
    assert.equal(deleteResponse.status, 204);

    // Verify DB removal
    const dbUser = await UserModel.findById(targetUser._id).exec();
    assert.equal(dbUser, null);

    // Verify 404 response on GET
    const getResponse = await fetch(`${baseUrl}/${targetUser._id}`, {
      headers: { authorization: adminAuthHeader }
    });
    assert.equal(getResponse.status, 404);
    const notFoundBody = (await getResponse.json()) as {
      success: boolean;
      status: string;
      message: string;
    };
    assert.equal(notFoundBody.success, false);
    assert.equal(notFoundBody.status, "fail");
    assert.equal(notFoundBody.message, "user not found");
  });
});