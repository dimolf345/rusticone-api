import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, describe, test } from "node:test";

import mongoose from "mongoose";

import { connectDatabase } from "../../config/database.js";
import { disconnectRedis, getRedisClient } from "../../config/redis.js";
import { SessionModel } from "../../models/session.js";
import {
  findValidSession,
  invalidateSessionCache,
  revokeSessionsFromOtherIps
} from "../session.service.js";

const SESSION_CACHE_PREFIX = "session:";

async function createStoredSession(overrides: {
  userId?: mongoose.Types.ObjectId;
  ipAddress?: string;
  expiresAt?: Date;
} = {}) {
  return SessionModel.create({
    userId: overrides.userId ?? new mongoose.Types.ObjectId(),
    refreshToken: `session-service-test-${randomUUID()}`,
    ipAddress: overrides.ipAddress,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000)
  });
}

async function cacheKeyExists(sessionId: string): Promise<boolean> {
  const client = await getRedisClient();
  return (await client.exists(`${SESSION_CACHE_PREFIX}${sessionId}`)) === 1;
}

describe("session.service caching", () => {
  before(async () => {
    await connectDatabase();
  });

  after(async () => {
    await disconnectRedis();
    await mongoose.disconnect();
  });

  afterEach(async () => {
    await SessionModel.deleteMany({ refreshToken: { $regex: "^session-service-test-" } });
    const client = await getRedisClient();
    const keys = await client.keys(`${SESSION_CACHE_PREFIX}*`);
    if (keys.length > 0) {
      await client.del(keys);
    }
  });

  test("findValidSession caches the session on a MongoDB read", async () => {
    const session = await createStoredSession();
    const sessionId = session._id.toString();
    const userId = session.userId.toString();

    assert.equal(await cacheKeyExists(sessionId), false);

    const result = await findValidSession(sessionId, userId);

    assert.ok(result);
    assert.equal(await cacheKeyExists(sessionId), true);
  });

  test("findValidSession serves a cached session without hitting MongoDB", async () => {
    const session = await createStoredSession();
    const sessionId = session._id.toString();
    const userId = session.userId.toString();

    await findValidSession(sessionId, userId);

    // Remove the document directly so only the cache can satisfy the next read.
    await SessionModel.deleteOne({ _id: session._id });

    const result = await findValidSession(sessionId, userId);

    assert.ok(result);
    assert.equal(result._id.toString(), sessionId);
  });

  test("invalidateSessionCache forces a fresh MongoDB read", async () => {
    const session = await createStoredSession();
    const sessionId = session._id.toString();
    const userId = session.userId.toString();

    await findValidSession(sessionId, userId);
    await SessionModel.deleteOne({ _id: session._id });
    await invalidateSessionCache(sessionId);

    const result = await findValidSession(sessionId, userId);

    assert.equal(result, null);
  });

  test("cached entry is rejected when the userId does not match", async () => {
    const session = await createStoredSession();
    const sessionId = session._id.toString();

    await findValidSession(sessionId, session.userId.toString());

    const result = await findValidSession(sessionId, new mongoose.Types.ObjectId().toString());

    assert.equal(result, null);
  });

  test("revokeSessionsFromOtherIps invalidates cached sessions from other IPs", async () => {
    const userId = new mongoose.Types.ObjectId();
    const otherIpSession = await createStoredSession({ userId, ipAddress: "10.0.0.1" });
    const sessionId = otherIpSession._id.toString();

    await findValidSession(sessionId, userId.toString());
    assert.equal(await cacheKeyExists(sessionId), true);

    const revoked = await revokeSessionsFromOtherIps(userId, "10.0.0.2");

    assert.equal(revoked, 1);
    assert.equal(await cacheKeyExists(sessionId), false);
  });
});
