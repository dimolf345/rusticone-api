import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import type { Server } from "node:net";
import path from "node:path";
import { after, afterEach, before, describe, test } from "node:test";

import express, { type Express } from "express";
import mongoose from "mongoose";
import pino from "pino";

import { connectDatabase } from "../../config/database.js";
import { uploadBufferToLocal } from "../../config/local-storage.js";
import { disconnectRedis, getRedisClient } from "../../config/redis.js";
import type { ICloudinaryUploader } from "../../interfaces/upload/index.js";
import { createLoggingMiddleware } from "../../logger/middleware.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { notFoundHandler } from "../../middleware/notFoundHandler.js";
import { SessionModel } from "../../models/session.js";
import { UserModel, type UserDocument } from "../../models/user.js";
import { TEMP_FOLDER, UploadService } from "../../services/upload.service.js";
import { generateAccessToken } from "../../utils/jwt.js";
import { createUploadRouter } from "../upload.js";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const USER_TEST_PREFIX = "upload-route-test-";
const createdRedisKeys: string[] = [];
const createdLocalFiles: string[] = [];

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
    app.use(notFoundHandler);
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
        if (createdLocalFiles.length > 0) {
            await Promise.all(
                createdLocalFiles.map((filePath) => rm(filePath, { force: true }))
            );
            createdLocalFiles.length = 0;
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

    test("GET /api/uploads/temp-catering/:filename - returns the uploaded image in development for an authenticated user", async () => {
        const customer = await createUser("customer");
        const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const { secure_url } = await uploadBufferToLocal(pngBytes, TEMP_FOLDER);
        const filename = path.basename(new URL(secure_url).pathname);

        const service = new UploadService();
        createdLocalFiles.push(await service.getTempImagePath(filename));

        const response = await fetch(`${baseUrl}/temp-catering/${filename}`, {
            method: "GET",
            headers: { authorization: await authHeader(customer) }
        });

        assert.equal(response.status, 200);
        assert.equal(
            response.headers.get("cross-origin-resource-policy"),
            "cross-origin"
        );
        const body = Buffer.from(await response.arrayBuffer());
        assert.deepEqual(body, pngBytes);
    });

    test("GET /api/uploads/temp-catering/:filename - returns 401 when unauthenticated", async () => {
        const response = await fetch(`${baseUrl}/temp-catering/missing.png`, {
            method: "GET"
        });

        assert.equal(response.status, 401);
    });

    test("GET /api/uploads/temp-catering/:filename - returns 404 when the image does not exist", async () => {
        const customer = await createUser("customer");

        const response = await fetch(`${baseUrl}/temp-catering/non-existent.png`, {
            method: "GET",
            headers: { authorization: await authHeader(customer) }
        });

        assert.equal(response.status, 404);
    });

    test("GET /api/uploads/temp-catering/:filename - returns 404 in production environment", async () => {
        const customer = await createUser("customer");
        const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const { secure_url } = await uploadBufferToLocal(pngBytes, TEMP_FOLDER);
        const filename = path.basename(new URL(secure_url).pathname);

        const service = new UploadService();
        createdLocalFiles.push(await service.getTempImagePath(filename));

        const previousNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";

        try {
            const response = await fetch(`${baseUrl}/temp-catering/${filename}`, {
                method: "GET",
                headers: { authorization: await authHeader(customer) }
            });

            assert.equal(response.status, 404);
        } finally {
            process.env.NODE_ENV = previousNodeEnv;
        }
    });
});
