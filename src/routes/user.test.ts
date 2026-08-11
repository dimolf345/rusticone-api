import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";

import express from "express";
import mongoose from "mongoose";
import pino from "pino";

import { connectDatabase } from "../config/database.js";
import { createLoggingMiddleware } from "../logger/middleware.js";
import { UserModel } from "../models/user.js";
import { generateAccessToken } from "../utils/jwt.js";
import { createUserRouter } from "./user.js";

const testUserIdPrefix = "user-route-test-";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

function createTestApp() {
  const app = express();
  const testLogger = pino({ level: "silent" });

  app.use(createLoggingMiddleware(testLogger));
  app.use(express.json());
  app.use("/api/users", createUserRouter());
  return app;
}

describe("User routes", () => {
  before(async () => {
    await connectDatabase();
  });

  after(async () => {
    await mongoose.disconnect();
  });

  afterEach(async () => {
    await UserModel.deleteMany({
      authProviderUserId: { $regex: `^${testUserIdPrefix}` }
    });
  });

  test("performs the user CRUD flow against MongoDB", async () => {
    const app = createTestApp();
    const server = app.listen(0);
    const adminUser = await UserModel.create({
      role: "admin",
      email: "admin-route@example.com",
      username: "admin-route",
      authProvider: "local",
      authProviderUserId: "admin-route-1",
      password: "secure-password",
      emailVerified: true
    });
    const authorization = `Bearer ${generateAccessToken(adminUser)}`;

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Unable to determine test server address");
      }

      const baseUrl = `http://127.0.0.1:${address.port}/api/users`;
      const createResponse = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization
        },
        body: JSON.stringify({
          role: "customer",
          email: "user-route@example.com",
          name: "Route User",
          authProvider: "google",
          authProviderUserId: `${testUserIdPrefix}1`,
          emailVerified: true
        })
      });

      assert.equal(createResponse.status, 201);
      const created = (await createResponse.json()) as {
        _id: string;
        email: string;
        name: string;
      };
      assert.equal(created.email, "user-route@example.com");
      assert.ok(created._id);

      const listResponse = await fetch(`${baseUrl}?email=user-route%40example.com`, {
        headers: { authorization }
      });
      assert.equal(listResponse.status, 200);
      const list = (await listResponse.json()) as {
        data: Array<{ _id: string }>;
        pagination: { total: number };
      };
      assert.equal(list.pagination.total, 1);
      assert.equal(list.data[0]?._id, created._id);

      const getResponse = await fetch(`${baseUrl}/${created._id}`, {
        headers: { authorization }
      });
      assert.equal(getResponse.status, 200);

      const updateResponse = await fetch(`${baseUrl}/${created._id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization
        },
        body: JSON.stringify({ name: "Updated Route User" })
      });
      assert.equal(updateResponse.status, 200);
      const updated = (await updateResponse.json()) as { name: string };
      assert.equal(updated.name, "updated route user");

      const storedUser = await UserModel.findById(created._id).lean().exec();
      assert.equal(storedUser?.name, "updated route user");

      const deleteResponse = await fetch(`${baseUrl}/${created._id}`, {
        method: "DELETE",
        headers: { authorization }
      });
      assert.equal(deleteResponse.status, 204);
      assert.equal(await UserModel.findById(created._id).exec(), null);

      const missingResponse = await fetch(`${baseUrl}/${created._id}`, {
        headers: { authorization }
      });
      assert.equal(missingResponse.status, 404);
      assert.deepEqual(await missingResponse.json(), { message: "user not found" });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      await UserModel.deleteMany({
        authProviderUserId: { $in: ["admin-route-1", `${testUserIdPrefix}1`] }
      });
    }
  });
});
