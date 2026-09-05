import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { Server } from "node:net";
import { after, afterEach, before, describe, test } from "node:test";

import express, { type Express } from "express";
import mongoose from "mongoose";
import pino from "pino";

import { connectDatabase } from "../../config/database.js";
import { disconnectRedis, getRedisClient } from "../../config/redis.js";
import type { ICloudinaryUploader } from "../../interfaces/upload/index.js";
import { createLoggingMiddleware } from "../../logger/middleware.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { SessionModel } from "../../models/session.js";
import { UserModel, type UserDocument } from "../../models/user.js";
import { UploadService } from "../../services/upload.service.js";
import { generateAccessToken } from "../../utils/jwt.js";
import { createUploadRouter } from "../upload.js";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const USER_TEST_PREFIX = "upload-route-test-";
const createdRedisKeys: string[] = [];

let uploadCount = 0;
const fakeUploader: ICloudinaryUploader = async () => {
    uploadCount += 1;
    return { secure_url: `https://cdn.example.com/upload-${uploadCount}.jpg` };
};

function createTestApp(): Express {
    const app = express();
    const testLogger = pino({ level: "silent" });

    app.use(createLoggingMiddleware(testLogger));
    app.use(
        "/api/uploads",
        createUploadRouter({ service: new UploadService(fakeUploader) })
    );
    app.use(errorHandler);
    return app;
}

async function createUser(role: "admin" | "customer"): Promise<UserDocument> {
    const unique = `${USER_TEST_PREFIX}${role}-${randomUUID()}`;
    return UserModel.create({
        role,
        name: `Upload ${role}`,
        email: `${unique}@example.com`,
        username: unique,
        authProvider: "local",
        authProviderUserId: unique,
        password: "secure-password",
        emailVerified: true
    });
}

async function authHeader(user: UserDocument): Promise<string> {
    const session = await SessionModel.create({
        userId: user._id,
        refreshTokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
        usedRefreshTokenHashes: [],
        generation: 0,
        userAgent: USER_TEST_PREFIX,
        expiresAt: new Date(Date.now() + 60_000)
    });
    return `Bearer ${generateAccessToken(user, session._id.toString())}`;
}

function imageBlob(content: string): Blob {
    return new Blob([Buffer.from(content)], { type: "image/png" });
}

describe("Upload routes", () => {
    let server: Server;
    let baseUrl: string;

    before(async () => {
        await connectDatabase();

        const app = createTestApp();
        await new Promise<void>((resolve) => {
            server = app.listen(0, "127.0.0.1", resolve);
        });

        const address = server.address();
        if (!address || typeof address === "string") {
            throw new Error("Unable to determine test server address");
        }

        baseUrl = `http://127.0.0.1:${address.port}/api/uploads`;
    });

    after(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
        await disconnectRedis();
        await mongoose.disconnect();
    });

    afterEach(async () => {
        uploadCount = 0;
        await UserModel.deleteMany({ email: { $regex: `^${USER_TEST_PREFIX}` } });
        await SessionModel.deleteMany({
            userAgent: USER_TEST_PREFIX
        });
        if (createdRedisKeys.length > 0) {
            const client = await getRedisClient();
            await client.del(createdRedisKeys);
            createdRedisKeys.length = 0;
        }
    });

    test("POST /api/uploads/temp - pre-uploads images and caches the URLs in Redis", async () => {
        const admin = await createUser("admin");

        const form = new FormData();
        form.append("images", imageBlob("first"), "a.png");
        form.append("images", imageBlob("second"), "b.png");

        const response = await fetch(`${baseUrl}/temp`, {
            method: "POST",
            headers: { authorization: await authHeader(admin) },
            body: form
        });

        assert.equal(response.status, 200);
        const payload = (await response.json()) as {
            uploadSessionId: string;
            imageUrls: string[];
        };
        assert.ok(payload.uploadSessionId);
        assert.equal(payload.imageUrls.length, 2);

        const key = `temp_images:${payload.uploadSessionId}`;
        createdRedisKeys.push(key);
        const client = await getRedisClient();
        const stored = await client.get(key);
        assert.ok(stored);
        assert.deepEqual(JSON.parse(stored), payload.imageUrls);
    });

    test("POST /api/uploads/temp - returns 400 when no files are provided", async () => {
        const admin = await createUser("admin");

        const response = await fetch(`${baseUrl}/temp`, {
            method: "POST",
            headers: { authorization: await authHeader(admin) },
            body: new FormData()
        });

        assert.equal(response.status, 400);
    });

    test("POST /api/uploads/temp - returns 403 for a non-admin user", async () => {
        const customer = await createUser("customer");

        const form = new FormData();
        form.append("images", imageBlob("first"), "a.png");

        const response = await fetch(`${baseUrl}/temp`, {
            method: "POST",
            headers: { authorization: await authHeader(customer) },
            body: form
        });

        assert.equal(response.status, 403);
    });
});
