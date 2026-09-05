import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";

import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { AUTH_PROVIDERS, USER_ROLES, UserModel } from "../models/user.js";
import { generateRefreshToken, verifyRefreshToken } from "./jwt.js";

process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const secret = process.env.JWT_REFRESH_SECRET;
const userId = new mongoose.Types.ObjectId().toString();
const sessionId = new mongoose.Types.ObjectId().toString();

describe("refresh JWT", () => {
  test("verifyRefreshToken rejects a missing or invalid jti", () => {
    for (const jti of [undefined, "", 42]) {
      const token = jwt.sign(
        { userId, sid: sessionId, generation: 0, jti },
        secret,
        { expiresIn: "5m" }
      );

      assert.throws(() => verifyRefreshToken(token), /Invalid refresh token payload/);
    }
  });

  test("verifyRefreshToken returns the generated non-empty jti", () => {
    const user = UserModel.hydrate({
      _id: userId,
      email: `${randomUUID()}@example.com`,
      name: "JWT Test",
      role: USER_ROLES.Customer,
      authProvider: AUTH_PROVIDERS.Local,
      authProviderUserId: randomUUID(),
      emailVerified: true
    });

    const payload = verifyRefreshToken(generateRefreshToken(user, sessionId, 0));

    assert.equal(typeof payload.jti, "string");
    assert.ok(payload.jti.length > 0);
  });
});
