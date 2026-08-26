import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { Server } from "node:net";
import { after, afterEach, before, describe, test } from "node:test";

import express, { type Express } from "express";
import mongoose from "mongoose";
import pino from "pino";

import { connectDatabase } from "../../config/database.js";
import { createLoggingMiddleware } from "../../logger/middleware.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { ProductModel } from "../../models/product.js";
import { QuoteModel } from "../../models/quote.js";
import { SessionModel } from "../../models/session.js";
import { UserModel, type UserDocument } from "../../models/user.js";
import { generateAccessToken } from "../../utils/jwt.js";
import { createQuotesRouter } from "../quote.js";

const QUOTE_TEST_PREFIX = "quote-route-test-";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

async function createAuthHeader(user: UserDocument): Promise<string> {
    const session = await SessionModel.create({
        userId: user._id,
        refreshTokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
        usedRefreshTokenHashes: [],
        generation: 0,
        userAgent: QUOTE_TEST_PREFIX,
        expiresAt: new Date(Date.now() + 60_000)
    });
    return `Bearer ${generateAccessToken(user, session._id.toString())}`;
}

async function createUser(role: "admin" | "customer"): Promise<UserDocument> {
    const unique = `${QUOTE_TEST_PREFIX}${role}-${randomUUID()}`;
    return UserModel.create({
        role,
        name: `Quote ${role}`,
        email: `${unique}@example.com`,
        username: unique,
        authProvider: "local",
        authProviderUserId: unique,
        password: "secure-password",
        emailVerified: true
    });
}

async function createProduct(basePrice: number): Promise<string> {
    const product = await ProductModel.create({
        name: `${QUOTE_TEST_PREFIX}product-${randomUUID()}`,
        basePrice,
        size: [1],
        categories: ["Pizza"],
        available: true,
        productImages: [],
        description: "Quote test product",
        suggestedQuantity: 1,
        addons: []
    });
    return product._id.toString();
}

function quotePayload(productId: string, overrides: Record<string, unknown> = {}) {
    return {
        requestedPeople: 10,
        dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
        products: [{ productId, quantity: 2 }],
        deliveryAddress: { street: "Main", city: "Rome", zipCode: "00100" },
        deliveryDate: "2026-09-01T12:00:00.000Z",
        ...overrides
    };
}

function createTestApp(): Express {
    const app = express();
    const testLogger = pino({ level: "silent" });

    app.use(createLoggingMiddleware(testLogger));
    app.use(express.json());
    app.use("/api/quotes", createQuotesRouter());
    app.use(errorHandler);
    return app;
}

describe("Quote routes", () => {
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

        baseUrl = `http://127.0.0.1:${address.port}/api/quotes`;
    });

    after(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
        await mongoose.disconnect();
    });

    afterEach(async () => {
        await QuoteModel.deleteMany({ dietaryNotes: { $regex: `^${QUOTE_TEST_PREFIX}` } });
        await ProductModel.deleteMany({ name: { $regex: `^${QUOTE_TEST_PREFIX}` } });
        await UserModel.deleteMany({ email: { $regex: `^${QUOTE_TEST_PREFIX}` } });
        await SessionModel.deleteMany({
            userAgent: QUOTE_TEST_PREFIX
        });
    });

    test("POST /api/quotes - snapshots prices and assigns the customer as owner", async () => {
        const customer = await createUser("customer");
        const productId = await createProduct(12);

        const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: await createAuthHeader(customer)
            },
            // Attempt to tamper with userId and pricing - both must be ignored.
            body: JSON.stringify(
                quotePayload(productId, { userId: "000000000000000000000000", deliveryFee: 5 })
            )
        });

        assert.equal(response.status, 201);
        const created = (await response.json()) as {
            _id: string;
            userId: string;
            status: string;
            initialPrice: number;
            finalPrice: number;
            products: Array<{ priceAtQuote: number }>;
        };

        assert.equal(created.userId, customer._id.toString());
        assert.equal(created.status, "pending");
        assert.equal(created.products[0]?.priceAtQuote, 12);
        // 12 * 2 + deliveryFee 5 = 29.
        assert.equal(created.initialPrice, 29);
        assert.equal(created.finalPrice, 29);
    });

    test("GET /api/quotes - customers only see their own quotes", async () => {
        const customerA = await createUser("customer");
        const customerB = await createUser("customer");
        const productId = await createProduct(8);

        await QuoteModel.create({
            userId: customerA._id,
            requestedPeople: 5,
            dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
            products: [{ productId, quantity: 1, priceAtQuote: 8 }],
            deliveryAddress: { street: "A", city: "Rome", zipCode: "00100" },
            deliveryDate: new Date(),
            initialPrice: 8,
            finalPrice: 8
        });
        await QuoteModel.create({
            userId: customerB._id,
            requestedPeople: 5,
            dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
            products: [{ productId, quantity: 1, priceAtQuote: 8 }],
            deliveryAddress: { street: "B", city: "Rome", zipCode: "00100" },
            deliveryDate: new Date(),
            initialPrice: 8,
            finalPrice: 8
        });

        const response = await fetch(baseUrl, {
            headers: { authorization: await createAuthHeader(customerA) }
        });

        assert.equal(response.status, 200);
        const list = (await response.json()) as {
            data: Array<{ userId: { id: string } }>;
            pagination: { total: number };
        };
        assert.equal(list.pagination.total, 1);
        assert.equal(list.data[0]?.userId.id, customerA._id.toString());
    });

    test("GET /api/quotes - admins see all quotes and can filter by userId", async () => {
        const admin = await createUser("admin");
        const customerA = await createUser("customer");
        const customerB = await createUser("customer");
        const productId = await createProduct(8);

        for (const owner of [customerA, customerB]) {
            await QuoteModel.create({
                userId: owner._id,
                requestedPeople: 5,
                dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
                products: [{ productId, quantity: 1, priceAtQuote: 8 }],
                deliveryAddress: { street: "X", city: "Rome", zipCode: "00100" },
                deliveryDate: new Date(),
                initialPrice: 8,
                finalPrice: 8
            });
        }

        const adminHeader = await createAuthHeader(admin);

        const allResponse = await fetch(baseUrl, { headers: { authorization: adminHeader } });
        const all = (await allResponse.json()) as { pagination: { total: number } };
        assert.equal(all.pagination.total, 2);

        const filtered = await fetch(`${baseUrl}?userId=${customerA._id.toString()}`, {
            headers: { authorization: adminHeader }
        });
        const filteredList = (await filtered.json()) as { pagination: { total: number } };
        assert.equal(filteredList.pagination.total, 1);
    });

    test("GET /api/quotes/:id - a customer cannot read another user's quote", async () => {
        const owner = await createUser("customer");
        const other = await createUser("customer");
        const productId = await createProduct(8);

        const quote = await QuoteModel.create({
            userId: owner._id,
            requestedPeople: 5,
            dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
            products: [{ productId, quantity: 1, priceAtQuote: 8 }],
            deliveryAddress: { street: "A", city: "Rome", zipCode: "00100" },
            deliveryDate: new Date(),
            initialPrice: 8,
            finalPrice: 8
        });

        const response = await fetch(`${baseUrl}/${quote._id.toString()}`, {
            headers: { authorization: await createAuthHeader(other) }
        });

        assert.equal(response.status, 403);
    });

    test("PATCH /api/quotes/:id - a customer cannot edit a confirmed quote", async () => {
        const owner = await createUser("customer");
        const productId = await createProduct(8);

        const quote = await QuoteModel.create({
            userId: owner._id,
            status: "confirmed",
            requestedPeople: 5,
            dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
            products: [{ productId, quantity: 1, priceAtQuote: 8 }],
            deliveryAddress: { street: "A", city: "Rome", zipCode: "00100" },
            deliveryDate: new Date(),
            initialPrice: 8,
            finalPrice: 8
        });

        const response = await fetch(`${baseUrl}/${quote._id.toString()}`, {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                authorization: await createAuthHeader(owner)
            },
            body: JSON.stringify({ requestedPeople: 20 })
        });

        assert.equal(response.status, 403);
    });

    test("DELETE /api/quotes/:id - admin soft-deletes and it disappears from reads", async () => {
        const admin = await createUser("admin");
        const owner = await createUser("customer");
        const productId = await createProduct(8);

        const quote = await QuoteModel.create({
            userId: owner._id,
            requestedPeople: 5,
            dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
            products: [{ productId, quantity: 1, priceAtQuote: 8 }],
            deliveryAddress: { street: "A", city: "Rome", zipCode: "00100" },
            deliveryDate: new Date(),
            initialPrice: 8,
            finalPrice: 8
        });

        const deleteResponse = await fetch(`${baseUrl}/${quote._id.toString()}`, {
            method: "DELETE",
            headers: { authorization: await createAuthHeader(admin) }
        });
        assert.equal(deleteResponse.status, 204);

        // Document is retained but stamped with deletedAt.
        const stored = await QuoteModel.findById(quote._id).lean().exec();
        assert.ok(stored);
        assert.ok(stored.deletedAt);

        // And excluded from the API read path.
        const getResponse = await fetch(`${baseUrl}/${quote._id.toString()}`, {
            headers: { authorization: await createAuthHeader(admin) }
        });
        assert.equal(getResponse.status, 404);
    });

    test("POST /api/quotes/:id/comments - derives sender from the token", async () => {
        const owner = await createUser("customer");
        const productId = await createProduct(8);

        const quote = await QuoteModel.create({
            userId: owner._id,
            requestedPeople: 5,
            dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
            products: [{ productId, quantity: 1, priceAtQuote: 8 }],
            deliveryAddress: { street: "A", city: "Rome", zipCode: "00100" },
            deliveryDate: new Date(),
            initialPrice: 8,
            finalPrice: 8
        });

        const response = await fetch(`${baseUrl}/${quote._id.toString()}/comments`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: await createAuthHeader(owner)
            },
            // senderId in the body must be ignored in favor of the token identity.
            body: JSON.stringify({
                senderId: "000000000000000000000000",
                message: "Please confirm gluten-free options."
            })
        });

        assert.equal(response.status, 201);
        const updated = (await response.json()) as {
            comments: Array<{ senderId: string; senderRole: string; message: string }>;
        };
        assert.equal(updated.comments.length, 1);
        assert.equal(updated.comments[0]?.senderId, owner._id.toString());
        assert.equal(updated.comments[0]?.senderRole, "customer");
        assert.equal(updated.comments[0]?.message, "Please confirm gluten-free options.");
    });

    test("PATCH /api/quotes/:id/comments/:commentId - the author edits their message", async () => {
        const owner = await createUser("customer");
        const productId = await createProduct(8);

        const quote = await QuoteModel.create({
            userId: owner._id,
            requestedPeople: 5,
            dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
            products: [{ productId, quantity: 1, priceAtQuote: 8 }],
            deliveryAddress: { street: "A", city: "Rome", zipCode: "00100" },
            deliveryDate: new Date(),
            initialPrice: 8,
            finalPrice: 8,
            comments: [
                { senderId: owner._id, senderRole: "customer", message: "Original message" }
            ]
        });
        const commentId = quote.comments[0]?._id?.toString();

        const response = await fetch(
            `${baseUrl}/${quote._id.toString()}/comments/${commentId}`,
            {
                method: "PATCH",
                headers: {
                    "content-type": "application/json",
                    authorization: await createAuthHeader(owner)
                },
                body: JSON.stringify({ message: "Edited message" })
            }
        );

        assert.equal(response.status, 200);
        const updated = (await response.json()) as {
            comments: Array<{ _id: string; message: string }>;
        };
        assert.equal(updated.comments.length, 1);
        assert.equal(updated.comments[0]?.message, "Edited message");
    });

    test("PATCH /api/quotes/:id/comments/:commentId - only the author can edit", async () => {
        const owner = await createUser("customer");
        const admin = await createUser("admin");
        const productId = await createProduct(8);

        const quote = await QuoteModel.create({
            userId: owner._id,
            requestedPeople: 5,
            dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
            products: [{ productId, quantity: 1, priceAtQuote: 8 }],
            deliveryAddress: { street: "A", city: "Rome", zipCode: "00100" },
            deliveryDate: new Date(),
            initialPrice: 8,
            finalPrice: 8,
            comments: [
                { senderId: owner._id, senderRole: "customer", message: "Original message" }
            ]
        });
        const commentId = quote.comments[0]?._id?.toString();

        // An admin who did not author the comment must not be able to edit it.
        const response = await fetch(
            `${baseUrl}/${quote._id.toString()}/comments/${commentId}`,
            {
                method: "PATCH",
                headers: {
                    "content-type": "application/json",
                    authorization: await createAuthHeader(admin)
                },
                body: JSON.stringify({ message: "Admin edit attempt" })
            }
        );

        assert.equal(response.status, 403);

        const stored = await QuoteModel.findById(quote._id).lean().exec();
        assert.equal(stored?.comments[0]?.message, "Original message");
    });

    test("PATCH /api/quotes/:id/comments/:commentId - rejects an empty message", async () => {
        const owner = await createUser("customer");
        const productId = await createProduct(8);

        const quote = await QuoteModel.create({
            userId: owner._id,
            requestedPeople: 5,
            dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
            products: [{ productId, quantity: 1, priceAtQuote: 8 }],
            deliveryAddress: { street: "A", city: "Rome", zipCode: "00100" },
            deliveryDate: new Date(),
            initialPrice: 8,
            finalPrice: 8,
            comments: [
                { senderId: owner._id, senderRole: "customer", message: "Original message" }
            ]
        });
        const commentId = quote.comments[0]?._id?.toString();

        const response = await fetch(
            `${baseUrl}/${quote._id.toString()}/comments/${commentId}`,
            {
                method: "PATCH",
                headers: {
                    "content-type": "application/json",
                    authorization: await createAuthHeader(owner)
                },
                body: JSON.stringify({ message: "   " })
            }
        );

        assert.equal(response.status, 400);
    });

    test("PATCH /api/quotes/:id/comments/:commentId - unknown comment returns 404", async () => {
        const owner = await createUser("customer");
        const productId = await createProduct(8);

        const quote = await QuoteModel.create({
            userId: owner._id,
            requestedPeople: 5,
            dietaryNotes: `${QUOTE_TEST_PREFIX}notes`,
            products: [{ productId, quantity: 1, priceAtQuote: 8 }],
            deliveryAddress: { street: "A", city: "Rome", zipCode: "00100" },
            deliveryDate: new Date(),
            initialPrice: 8,
            finalPrice: 8,
            comments: [
                { senderId: owner._id, senderRole: "customer", message: "Original message" }
            ]
        });

        const response = await fetch(
            `${baseUrl}/${quote._id.toString()}/comments/000000000000000000000000`,
            {
                method: "PATCH",
                headers: {
                    "content-type": "application/json",
                    authorization: await createAuthHeader(owner)
                },
                body: JSON.stringify({ message: "Edited message" })
            }
        );

        assert.equal(response.status, 404);
    });
});
