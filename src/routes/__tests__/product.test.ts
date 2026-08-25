import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Server } from "node:net";
import { after, afterEach, before, describe, test } from "node:test";

import express, { type Express } from "express";
import mongoose from "mongoose";
import pino from "pino";

import { connectDatabase } from "../../config/database.js";
import { disconnectRedis, getRedisClient } from "../../config/redis.js";
import { createLoggingMiddleware } from "../../logger/middleware.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { ProductModel } from "../../models/product.js";
import { SessionModel } from "../../models/session.js";
import { UserModel, type UserDocument } from "../../models/user.js";
import { generateAccessToken } from "../../utils/jwt.js";
import { createProductsRouter } from "../product.js";

const PRODUCT_TEST_PREFIX = "product-route-test-";
const UPLOAD_KEY_PREFIX = "temp_images:";
const createdRedisKeys: string[] = [];

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

async function createAuthHeader(user: UserDocument): Promise<string> {
    const session = await SessionModel.create({
        userId: user._id,
        refreshToken: `${PRODUCT_TEST_PREFIX}refresh-${randomUUID()}`,
        expiresAt: new Date(Date.now() + 60_000)
    });
    return `Bearer ${generateAccessToken(user, session._id.toString())}`;
}

async function seedUploadSession(imageUrls: string[]): Promise<string> {
    const uploadSessionId = randomUUID();
    const key = `${UPLOAD_KEY_PREFIX}${uploadSessionId}`;
    const client = await getRedisClient();
    await client.set(key, JSON.stringify(imageUrls), { EX: 3600 });
    createdRedisKeys.push(key);
    return uploadSessionId;
}

function createTestApp(): Express {
    const app = express();
    const testLogger = pino({ level: "silent" });

    app.use(createLoggingMiddleware(testLogger));
    app.use(express.json());
    app.use("/api/products", createProductsRouter());
    app.use(errorHandler);
    return app;
}

describe("Product routes", () => {
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

        baseUrl = `http://127.0.0.1:${address.port}/api/products`;
    });

    after(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
        await disconnectRedis();
        await mongoose.disconnect();
    });

    afterEach(async () => {
        await ProductModel.deleteMany({
            name: { $regex: `^${PRODUCT_TEST_PREFIX}` }
        });
        await UserModel.deleteMany({
            email: { $regex: "^admin-product-route-" }
        });
        await SessionModel.deleteMany({
            refreshToken: { $regex: `^${PRODUCT_TEST_PREFIX}refresh-` }
        });
        if (createdRedisKeys.length > 0) {
            const client = await getRedisClient();
            await client.del(createdRedisKeys);
            createdRedisKeys.length = 0;
        }
    });

    test("POST /api/products - creates a product for an admin user", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Product ${Date.now()}`,
            email: `admin-product-route-${Date.now()}@example.com`,
            username: `admin-product-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-product-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: await createAuthHeader(adminUser)
            },
            body: JSON.stringify({
                name: `${PRODUCT_TEST_PREFIX}pizza`,
                basePrice: 14.5,
                size: [1, 2],
                categories: ["Pizza"],
                available: true,
                productImages: ["https://example.com/pizza.png"],
                description: "A test pizza",
                suggestedQuantity: 2,
                addons: [],
                unitType: "Pezzo",
                lastUpdatedBy: "admin"
            })
        });

        assert.equal(response.status, 201);
        const created = (await response.json()) as { id: string; name: string; basePrice: number };
        assert.ok(created.id);
        assert.equal(created.name, `${PRODUCT_TEST_PREFIX}pizza`);
        assert.equal(created.basePrice, 14.5);

        const dbProduct = await ProductModel.findById(created.id).lean().exec();
        assert.ok(dbProduct);
        assert.equal(dbProduct.name, `${PRODUCT_TEST_PREFIX}pizza`);
    });

    test("GET /api/products - returns a paginated product list", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Product ${Date.now()}`,
            email: `admin-product-route-${Date.now()}@example.com`,
            username: `admin-product-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-product-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        await ProductModel.create({
            name: `${PRODUCT_TEST_PREFIX}list-item`,
            basePrice: 9.99,
            size: [1],
            categories: ["Pizza"],
            available: true,
            productImages: ["https://example.com/list.png"],
            description: "List item",
            suggestedQuantity: 1,
            addons: []
        });

        const response = await fetch(`${baseUrl}?name=${encodeURIComponent(`${PRODUCT_TEST_PREFIX}list-item`)}`, {
            headers: {
                authorization: await createAuthHeader(adminUser)
            }
        });

        assert.equal(response.status, 200);
        const list = (await response.json()) as {
            data: Array<{ name: string }>;
            pagination: { total: number };
        };

        assert.equal(list.pagination.total, 1);
        assert.equal(list.data[0]?.name, `${PRODUCT_TEST_PREFIX}list-item`);
    });

    test("GET /api/products/:id - fetches a product by id", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Product ${Date.now()}`,
            email: `admin-product-route-${Date.now()}@example.com`,
            username: `admin-product-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-product-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        const targetProduct = await ProductModel.create({
            name: `${PRODUCT_TEST_PREFIX}single-item`,
            basePrice: 18,
            size: [2],
            categories: ["Pizza"],
            available: true,
            productImages: ["https://example.com/single.png"],
            description: "Single item",
            suggestedQuantity: 1,
            addons: []
        });

        const response = await fetch(`${baseUrl}/${targetProduct._id}`, {
            headers: {
                authorization: await createAuthHeader(adminUser)
            }
        });

        assert.equal(response.status, 200);
        const product = (await response.json()) as { id: string; name: string };
        assert.equal(product.id, String(targetProduct._id));
        assert.equal(product.name, `${PRODUCT_TEST_PREFIX}single-item`);
    });

    test("PATCH /api/products/:id - updates a product", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Product ${Date.now()}`,
            email: `admin-product-route-${Date.now()}@example.com`,
            username: `admin-product-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-product-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        const targetProduct = await ProductModel.create({
            name: `${PRODUCT_TEST_PREFIX}update-item`,
            basePrice: 22,
            size: [1],
            categories: ["Pizza"],
            available: true,
            productImages: ["https://example.com/update.png"],
            description: "Before update",
            suggestedQuantity: 1,
            addons: []
        });

        const response = await fetch(`${baseUrl}/${targetProduct._id}`, {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                authorization: await createAuthHeader(adminUser)
            },
            body: JSON.stringify({
                name: `${PRODUCT_TEST_PREFIX}updated-item`,
                available: false,
                description: "After update"
            })
        });

        assert.equal(response.status, 200);
        const updated = (await response.json()) as { name: string; available: boolean; description: string };
        assert.equal(updated.name, `${PRODUCT_TEST_PREFIX}updated-item`);
        assert.equal(updated.available, false);
        assert.equal(updated.description, "After update");

        const dbProduct = await ProductModel.findById(targetProduct._id).lean().exec();
        assert.ok(dbProduct);
        assert.equal(dbProduct.name, `${PRODUCT_TEST_PREFIX}updated-item`);
        assert.equal(dbProduct.available, false);
    });

    test("POST /api/products - attaches pre-uploaded images from uploadSessionId", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Product ${Date.now()}`,
            email: `admin-product-route-${Date.now()}@example.com`,
            username: `admin-product-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-product-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        const imageUrls = [
            "https://cdn.example.com/a.jpg",
            "https://cdn.example.com/b.jpg"
        ];
        const uploadSessionId = await seedUploadSession(imageUrls);

        const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: await createAuthHeader(adminUser)
            },
            body: JSON.stringify({
                name: `${PRODUCT_TEST_PREFIX}with-images`,
                basePrice: 10,
                size: [1],
                categories: ["Pizza"],
                available: true,
                description: "Has pre-uploaded images",
                suggestedQuantity: 1,
                addons: [],
                uploadSessionId
            })
        });

        assert.equal(response.status, 201);
        const created = (await response.json()) as { _id: string; productImages: string[] };
        assert.deepEqual(created.productImages, imageUrls);

        // The session must be consumed exactly once.
        const client = await getRedisClient();
        assert.equal(await client.get(`${UPLOAD_KEY_PREFIX}${uploadSessionId}`), null);
    });

    test("POST /api/products - rejects an invalid or expired uploadSessionId", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Product ${Date.now()}`,
            email: `admin-product-route-${Date.now()}@example.com`,
            username: `admin-product-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-product-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: await createAuthHeader(adminUser)
            },
            body: JSON.stringify({
                name: `${PRODUCT_TEST_PREFIX}expired`,
                basePrice: 10,
                size: [1],
                categories: ["Pizza"],
                available: true,
                description: "Expired upload session",
                suggestedQuantity: 1,
                addons: [],
                uploadSessionId: randomUUID()
            })
        });

        assert.equal(response.status, 400);
    });

    test("POST /api/products - creates a product with no images when uploadSessionId is omitted", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Product ${Date.now()}`,
            email: `admin-product-route-${Date.now()}@example.com`,
            username: `admin-product-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-product-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: await createAuthHeader(adminUser)
            },
            body: JSON.stringify({
                name: `${PRODUCT_TEST_PREFIX}no-images`,
                basePrice: 10,
                size: [1],
                categories: ["Pizza"],
                available: true,
                description: "No images provided",
                suggestedQuantity: 1,
                addons: []
            })
        });

        assert.equal(response.status, 201);
        const created = (await response.json()) as { productImages?: string[] };
        assert.deepEqual(created.productImages ?? [], []);
    });
});
