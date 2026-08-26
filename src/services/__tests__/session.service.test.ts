import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, afterEach, before, describe, test } from "node:test";

import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { connectDatabase } from "../../config/database.js";
import { disconnectRedis, getRedisClient } from "../../config/redis.js";
import { SessionModel } from "../../models/session.js";
import { AUTH_PROVIDERS, USER_ROLES, UserModel } from "../../models/user.js";
import {
  generateRefreshToken,
  verifyRefreshToken
} from "../../utils/jwt.js";
const originalAuthCacheTimeoutMs = process.env.AUTH_SESSION_CACHE_TIMEOUT_MS;
const originalAuthCacheCooldownMs = process.env.AUTH_SESSION_CACHE_COOLDOWN_MS;
process.env.AUTH_SESSION_CACHE_TIMEOUT_MS = "20";
process.env.AUTH_SESSION_CACHE_COOLDOWN_MS = "40";

const {
  createSession,
  findValidSession,
  revokeSessionByRefreshToken,
  rotateRefreshToken
} = await import("../session.service.js");

const SESSION_CACHE_PREFIX = "session:";
const AUTH_CACHE_COOLDOWN_MS = 40;

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function waitForAuthCacheCooldown(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, AUTH_CACHE_COOLDOWN_MS + 10));
}

async function createStoredSession(overrides: {
  userId?: mongoose.Types.ObjectId;
  ipAddress?: string;
  expiresAt?: Date;
} = {}) {
  return SessionModel.create({
    userId: overrides.userId ?? new mongoose.Types.ObjectId(),
    refreshTokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
    usedRefreshTokenHashes: [],
    generation: 0,
    userAgent: "session-service-test",
    ipAddress: overrides.ipAddress,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000)
  });
}

function createUser() {
  return UserModel.hydrate({
    _id: new mongoose.Types.ObjectId(),
    email: `${randomUUID()}@example.com`,
    name: "Session Test",
    role: USER_ROLES.Customer,
    authProvider: AUTH_PROVIDERS.Local,
    authProviderUserId: randomUUID(),
    emailVerified: true
  });
}

const sessionRequest = {
  ip: "127.0.0.1",
  header(name: string): string | undefined {
    return name.toLowerCase() === "user-agent" ? "session-service-test" : undefined;
  }
};

async function cacheKeyExists(sessionId: string): Promise<boolean> {
  const client = await getRedisClient();
  return (await client.exists(`${SESSION_CACHE_PREFIX}${sessionId}`)) === 1;
}

async function setRawCachedSession(sessionId: string, raw: string): Promise<void> {
  const client = await getRedisClient();
  await client.set(`${SESSION_CACHE_PREFIX}${sessionId}`, raw);
}

function validCachedSession(sessionId: string, userId: string): string {
  return JSON.stringify({
    sessionId,
    userId,
    expiresAt: Date.now() + 60_000
  });
}

function invalidCachedSessions(sessionId: string, userId: string): string[] {
  return [
    "not-json",
    "null",
    "[]",
    JSON.stringify("session"),
    JSON.stringify({}),
    JSON.stringify({ sessionId, userId, expiresAt: "soon" }),
    validCachedSession("not-an-object-id", userId),
    validCachedSession(sessionId, "not-an-object-id"),
    validCachedSession(new mongoose.Types.ObjectId().toString(), userId),
    validCachedSession(sessionId, new mongoose.Types.ObjectId().toString()),
    `{"sessionId":"${sessionId}","userId":"${userId}","expiresAt":1e999}`,
    JSON.stringify({ sessionId, userId, expiresAt: Date.now() - 1 })
  ];
}

async function withFailingRedisCommand<T>(
  command: "get" | "set" | "del",
  operation: () => Promise<T>
): Promise<T> {
  const client = await getRedisClient();
  const original = client[command];

  Object.defineProperty(client, command, {
    configurable: true,
    value: async () => {
      throw new Error(`Redis ${command} unavailable`);
    }
  });

  try {
    return await operation();
  } finally {
    Object.defineProperty(client, command, {
      configurable: true,
      value: original
    });
    await waitForAuthCacheCooldown();
  }
}

describe("session.service caching", () => {
  before(async () => {
    await connectDatabase();
  });

  after(async () => {
    await disconnectRedis();
    await mongoose.disconnect();
    if (originalAuthCacheTimeoutMs === undefined) {
      delete process.env.AUTH_SESSION_CACHE_TIMEOUT_MS;
    } else {
      process.env.AUTH_SESSION_CACHE_TIMEOUT_MS = originalAuthCacheTimeoutMs;
    }
    if (originalAuthCacheCooldownMs === undefined) {
      delete process.env.AUTH_SESSION_CACHE_COOLDOWN_MS;
    } else {
      process.env.AUTH_SESSION_CACHE_COOLDOWN_MS = originalAuthCacheCooldownMs;
    }
  });

  afterEach(async () => {
    await SessionModel.deleteMany({ userAgent: "session-service-test" });
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

  test("findValidSession rejects a valid cache hint after the MongoDB session is deleted", async () => {
    const session = await createStoredSession();
    const sessionId = session._id.toString();
    const userId = session.userId.toString();

    await setRawCachedSession(sessionId, validCachedSession(sessionId, userId));
    await SessionModel.deleteOne({ _id: session._id });

    const result = await findValidSession(sessionId, userId);

    assert.equal(result, null);
  });

  test("findValidSession rejects a valid cache hint after the MongoDB session is revoked", async () => {
    const session = await createStoredSession();
    const sessionId = session._id.toString();
    const userId = session.userId.toString();

    await setRawCachedSession(sessionId, validCachedSession(sessionId, userId));
    await SessionModel.updateOne({ _id: session._id }, { $set: { revokedAt: new Date() } });

    const result = await findValidSession(sessionId, userId);

    assert.equal(result, null);
  });

  test("malformed and invalid cache entries fall back to MongoDB", async () => {
    const session = await createStoredSession();
    const sessionId = session._id.toString();
    const userId = session.userId.toString();

    for (const raw of invalidCachedSessions(sessionId, userId)) {
      await setRawCachedSession(sessionId, raw);

      const result = await findValidSession(sessionId, userId);

      assert.equal(result?._id.toString(), sessionId, `failed cache entry: ${raw}`);
    }
  });

  test("malformed and invalid cache entries are deleted when MongoDB has no session", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const sessionId = new mongoose.Types.ObjectId().toString();

    for (const entry of invalidCachedSessions(sessionId, userId)) {
      await setRawCachedSession(sessionId, entry);

      const result = await findValidSession(sessionId, userId);

      assert.equal(result, null);
      assert.equal(await cacheKeyExists(sessionId), false, `failed cache entry: ${entry}`);
    }
  });

  test("Redis read and write outages do not prevent MongoDB session validation", async () => {
    const readSession = await createStoredSession();
    const readResult = await withFailingRedisCommand("get", () =>
      findValidSession(readSession._id.toString(), readSession.userId.toString())
    );
    assert.equal(readResult?._id.toString(), readSession._id.toString());

    const writeSession = await createStoredSession();
    const writeResult = await withFailingRedisCommand("set", () =>
      findValidSession(writeSession._id.toString(), writeSession.userId.toString())
    );
    assert.equal(writeResult?._id.toString(), writeSession._id.toString());
  });

  test("a stalled Redis command opens a cooldown that bypasses Redis on the next auth request", {
    timeout: 3_000
  }, async () => {
    const firstSession = await createStoredSession();
    const secondSession = await createStoredSession();
    const client = await getRedisClient();
    const originalGet = client.get;
    let getCalls = 0;
    const releaseStalledGets: Array<() => void> = [];

    Object.defineProperty(client, "get", {
      configurable: true,
      value: () => {
        getCalls += 1;
        return new Promise<string | null>((resolve) => {
          releaseStalledGets.push(() => resolve(null));
        });
      }
    });

    try {
      const firstResult = await findValidSession(
        firstSession._id.toString(),
        firstSession.userId.toString()
      );
      const secondResult = await findValidSession(
        secondSession._id.toString(),
        secondSession.userId.toString()
      );

      assert.equal(firstResult?._id.toString(), firstSession._id.toString());
      assert.equal(secondResult?._id.toString(), secondSession._id.toString());
      assert.equal(getCalls, 1);
    } finally {
      for (const releaseStalledGet of releaseStalledGets) {
        releaseStalledGet();
      }
      Object.defineProperty(client, "get", {
        configurable: true,
        value: originalGet
      });
      await waitForAuthCacheCooldown();
    }
  });

  test("a Redis operation remains in flight after its timeout until the operation settles", {
    timeout: 1_000
  }, async () => {
    const firstSession = await createStoredSession();
    const secondSession = await createStoredSession();
    const thirdSession = await createStoredSession();
    const client = await getRedisClient();
    const originalGet = client.get;
    let getCalls = 0;
    let releaseFirstGet: (() => void) | undefined;

    Object.defineProperty(client, "get", {
      configurable: true,
      value: () => {
        getCalls += 1;
        if (getCalls === 1) {
          return new Promise<string | null>((resolve) => {
            releaseFirstGet = () => resolve(null);
          });
        }
        return Promise.resolve(null);
      }
    });

    try {
      const firstResult = await findValidSession(
        firstSession._id.toString(),
        firstSession.userId.toString()
      );
      await waitForAuthCacheCooldown();

      const secondResult = await findValidSession(
        secondSession._id.toString(),
        secondSession.userId.toString()
      );

      assert.equal(firstResult?._id.toString(), firstSession._id.toString());
      assert.equal(secondResult?._id.toString(), secondSession._id.toString());
      assert.equal(getCalls, 1);

      assert.ok(releaseFirstGet);
      releaseFirstGet();
      await waitForAuthCacheCooldown();

      const thirdResult = await findValidSession(
        thirdSession._id.toString(),
        thirdSession.userId.toString()
      );

      assert.equal(thirdResult?._id.toString(), thirdSession._id.toString());
      assert.equal(getCalls, 2);
    } finally {
      releaseFirstGet?.();
      Object.defineProperty(client, "get", {
        configurable: true,
        value: originalGet
      });
      await waitForAuthCacheCooldown();
    }
  });

  test("concurrent auth requests start at most one stalled Redis operation", {
    timeout: 3_000
  }, async () => {
    const sessions = await Promise.all([
      createStoredSession(),
      createStoredSession(),
      createStoredSession(),
      createStoredSession()
    ]);
    const client = await getRedisClient();
    const originalGet = client.get;
    let getCalls = 0;
    const releaseStalledGets: Array<() => void> = [];

    Object.defineProperty(client, "get", {
      configurable: true,
      value: () => {
        getCalls += 1;
        return new Promise<string | null>((resolve) => {
          releaseStalledGets.push(() => resolve(null));
        });
      }
    });

    try {
      const results = await Promise.all(
        sessions.map((session) =>
          findValidSession(session._id.toString(), session.userId.toString())
        )
      );

      assert.deepEqual(
        results.map((result) => result?._id.toString()),
        sessions.map((session) => session._id.toString())
      );
      assert.equal(getCalls, 1);
    } finally {
      for (const releaseStalledGet of releaseStalledGets) {
        releaseStalledGet();
      }
      Object.defineProperty(client, "get", {
        configurable: true,
        value: originalGet
      });
      await waitForAuthCacheCooldown();
    }
  });

  test("Redis delete outage leaves stale cache unable to authorize a revoked session", async () => {
    const user = createUser();
    const created = await createSession(sessionRequest, user);
    await setRawCachedSession(
      created.sessionId,
      validCachedSession(created.sessionId, user._id.toString())
    );

    const revokedSessionId = await withFailingRedisCommand("del", () =>
      revokeSessionByRefreshToken(created.refreshToken)
    );

    assert.equal(revokedSessionId, created.sessionId);
    assert.equal(await cacheKeyExists(created.sessionId), true);
    assert.equal(await findValidSession(created.sessionId, user._id.toString()), null);
  });

  test("cached entry is rejected when the userId does not match", async () => {
    const session = await createStoredSession();
    const sessionId = session._id.toString();

    await findValidSession(sessionId, session.userId.toString());

    const result = await findValidSession(sessionId, new mongoose.Types.ObjectId().toString());

    assert.equal(result, null);
  });

  test("createSession persists only a refresh token hash with a stable signed sid", async () => {
    const user = createUser();

    const created = await createSession(sessionRequest, user);
    const payload = verifyRefreshToken(created.refreshToken);
    const stored = await SessionModel.findById(created.sessionId).lean();

    assert.ok(stored);
    assert.equal(payload.userId, user._id.toString());
    assert.equal(payload.sid, created.sessionId);
    assert.equal(payload.generation, 0);
    assert.equal(stored.refreshTokenHash, hashRefreshToken(created.refreshToken));
    assert.deepEqual(stored.usedRefreshTokenHashes, []);
    assert.equal(stored.generation, 0);
    assert.equal("refreshToken" in stored, false);
    assert.equal(stored.expiresAt.getTime(), payload.expiresAt.getTime());
  });

  test("verifyRefreshToken rejects missing or invalid scoped payload fields", () => {
    const secret = process.env.JWT_REFRESH_SECRET as string;
    const sessionId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const invalidPayloads = [
      { sid: sessionId, generation: 0 },
      { userId, generation: 0 },
      { userId, sid: sessionId },
      { userId, sid: sessionId, generation: -1 },
      { userId, sid: sessionId, generation: 1.5 },
      { userId, sid: sessionId, generation: 0, jti: "" },
      { userId: "not-an-object-id", sid: sessionId, generation: 0 },
      { userId, sid: "not-an-object-id", generation: 0 }
    ];

    for (const payload of invalidPayloads) {
      const token = jwt.sign(payload, secret, { expiresIn: "5m" });
      assert.throws(() => verifyRefreshToken(token), /Invalid refresh token payload/);
    }

    const tokenWithoutExp = jwt.sign(
      { userId, sid: sessionId, generation: 0 },
      secret,
      { noTimestamp: true }
    );
    assert.throws(() => verifyRefreshToken(tokenWithoutExp), /Invalid refresh token payload/);

    const tokenWithFractionalExp = jwt.sign(
      {
        userId,
        sid: sessionId,
        generation: 0,
        jti: randomUUID(),
        exp: Date.now() / 1000 + 300.5
      },
      secret,
      { noTimestamp: true }
    );
    assert.throws(
      () => verifyRefreshToken(tokenWithFractionalExp),
      /Invalid refresh token payload/
    );
  });

  test("only one concurrent rotation of the active refresh token succeeds", async () => {
    const user = createUser();
    const created = await createSession(sessionRequest, user);

    const [first, second] = await Promise.all([
      rotateRefreshToken(created.refreshToken),
      rotateRefreshToken(created.refreshToken)
    ]);
    const statuses = [first.status, second.status].sort();

    assert.deepEqual(statuses, ["reuse", "rotated"]);

    const stored = await SessionModel.findById(created.sessionId).lean();
    assert.ok(stored?.revokedAt);
    assert.equal(stored.generation, 1);
    assert.deepEqual(stored.usedRefreshTokenHashes, [hashRefreshToken(created.refreshToken)]);
  });

  test("rotation keeps the stable sid and synchronizes the replacement expiry", async () => {
    const user = createUser();
    const created = await createSession(sessionRequest, user);

    const result = await rotateRefreshToken(created.refreshToken);
    assert.equal(result.status, "rotated");
    if (result.status !== "rotated") {
      return;
    }

    const payload = verifyRefreshToken(result.refreshToken);
    const stored = await SessionModel.findById(created.sessionId).lean();

    assert.equal(result.sessionId, created.sessionId);
    assert.equal(payload.sid, created.sessionId);
    assert.equal(payload.generation, 1);
    assert.equal(stored?.generation, 1);
    assert.equal(stored?.expiresAt.getTime(), payload.expiresAt.getTime());
    assert.equal(stored?.refreshTokenHash, hashRefreshToken(result.refreshToken));
  });

  test("reuse of a rotated token revokes the family and invalidates its cache", async () => {
    const user = createUser();
    const created = await createSession(sessionRequest, user);
    await findValidSession(created.sessionId, user._id.toString());
    assert.equal(await cacheKeyExists(created.sessionId), true);

    const rotated = await rotateRefreshToken(created.refreshToken);
    assert.equal(rotated.status, "rotated");
    await findValidSession(created.sessionId, user._id.toString());

    const replay = await rotateRefreshToken(created.refreshToken);

    assert.equal(replay.status, "reuse");
    assert.ok((await SessionModel.findById(created.sessionId).lean())?.revokedAt);
    assert.equal(await cacheKeyExists(created.sessionId), false);
    assert.equal(await findValidSession(created.sessionId, user._id.toString()), null);
  });

  test("invalid refresh credentials return an explicit invalid result", async () => {
    const result = await rotateRefreshToken("not-a-jwt");

    assert.deepEqual(result, { status: "invalid" });
  });

  test("logout lookup revokes only the family safely identified by the signed token", async () => {
    const user = createUser();
    const created = await createSession(sessionRequest, user);
    const unrelated = await createStoredSession({ userId: user._id });
    await findValidSession(created.sessionId, user._id.toString());

    const sessionId = await revokeSessionByRefreshToken(created.refreshToken);
    const unrelatedAfterLogout = await SessionModel.findById(unrelated._id).lean();

    assert.equal(sessionId, created.sessionId);
    assert.ok((await SessionModel.findById(created.sessionId).lean())?.revokedAt);
    assert.equal(unrelatedAfterLogout?.revokedAt, undefined);
    assert.equal(await cacheKeyExists(created.sessionId), false);
    assert.equal(await revokeSessionByRefreshToken("not-a-jwt"), null);
  });

  test("generateRefreshToken signs the supplied stable sid and generation", () => {
    const user = createUser();
    const sessionId = new mongoose.Types.ObjectId().toString();

    const payload = verifyRefreshToken(generateRefreshToken(user, sessionId, 4));

    assert.equal(payload.sid, sessionId);
    assert.equal(payload.generation, 4);
  });
});
