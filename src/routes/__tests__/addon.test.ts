import assert from "node:assert/strict";
import type { Server } from "node:net";
import { after, afterEach, before, describe, test } from "node:test";

import express, { type Express } from "express";
import mongoose from "mongoose";
import pino from "pino";

import { connectDatabase } from "../../config/database.js";
import { createLoggingMiddleware } from "../../logger/middleware.js";
import { errorHandler } from "../../middleware/errorHandler.js";
import { AddonModel } from "../../models/addon.js";
import { UserModel } from "../../models/user.js";
import { generateAccessToken } from "../../utils/jwt.js";
import { createAddonsRouter } from "../addon.js";

const ADDON_TEST_PREFIX = "addon-route-test-";

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

function createTestApp(): Express {
    const app = express();
    const testLogger = pino({ level: "silent" });

    app.use(createLoggingMiddleware(testLogger));
    app.use(express.json());
    app.use("/api/addons", createAddonsRouter());
    app.use(errorHandler);
    return app;
}

describe("Addon routes", () => {
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

        baseUrl = `http://127.0.0.1:${address.port}/api/addons`;
    });

    after(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
        });
        await mongoose.disconnect();
    });

    afterEach(async () => {
        await AddonModel.deleteMany({
            name: { $regex: `^${ADDON_TEST_PREFIX}` }
        });
        await UserModel.deleteMany({
            email: { $regex: "^admin-addon-route-" }
        });
    });

    test("POST /api/addons - creates an addon for an admin user", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Addon ${Date.now()}`,
            email: `admin-addon-route-${Date.now()}@example.com`,
            username: `admin-addon-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-addon-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        const response = await fetch(baseUrl, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${generateAccessToken(adminUser)}`
            },
            body: JSON.stringify({
                name: `${ADDON_TEST_PREFIX}burrata`,
                price: 3.5,
                note: "Extra topping"
            })
        });

        assert.equal(response.status, 201);
        const created = (await response.json()) as { _id: string; name: string; price: number };
        assert.ok(created._id);
        assert.equal(created.name, `${ADDON_TEST_PREFIX}burrata`);
        assert.equal(created.price, 3.5);

        const dbAddon = await AddonModel.findById(created._id).lean().exec();
        assert.ok(dbAddon);
        assert.equal(dbAddon.name, `${ADDON_TEST_PREFIX}burrata`);
    });

    test("GET /api/addons - returns a paginated addon list", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Addon ${Date.now()}`,
            email: `admin-addon-route-${Date.now()}@example.com`,
            username: `admin-addon-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-addon-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        await AddonModel.create({
            name: `${ADDON_TEST_PREFIX}list-item`,
            price: 5,
            note: "List item"
        });

        const response = await fetch(`${baseUrl}?name=${encodeURIComponent(`${ADDON_TEST_PREFIX}list-item`)}`, {
            headers: {
                authorization: `Bearer ${generateAccessToken(adminUser)}`
            }
        });

        assert.equal(response.status, 200);
        const list = (await response.json()) as {
            data: Array<{ name: string }>;
            pagination: { total: number };
        };

        assert.equal(list.pagination.total, 1);
        assert.equal(list.data[0]?.name, `${ADDON_TEST_PREFIX}list-item`);
    });

    test("GET /api/addons/:id - fetches an addon by id", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Addon ${Date.now()}`,
            email: `admin-addon-route-${Date.now()}@example.com`,
            username: `admin-addon-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-addon-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        const targetAddon = await AddonModel.create({
            name: `${ADDON_TEST_PREFIX}single-item`,
            price: 8,
            note: "Single item"
        });

        const response = await fetch(`${baseUrl}/${targetAddon._id}`, {
            headers: {
                authorization: `Bearer ${generateAccessToken(adminUser)}`
            }
        });

        assert.equal(response.status, 200);
        const addon = (await response.json()) as { _id: string; name: string };
        assert.equal(addon._id, String(targetAddon._id));
        assert.equal(addon.name, `${ADDON_TEST_PREFIX}single-item`);
    });

    test("PATCH /api/addons/:id - updates an addon", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Addon ${Date.now()}`,
            email: `admin-addon-route-${Date.now()}@example.com`,
            username: `admin-addon-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-addon-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        const targetAddon = await AddonModel.create({
            name: `${ADDON_TEST_PREFIX}update-item`,
            price: 12,
            note: "Before update"
        });

        const response = await fetch(`${baseUrl}/${targetAddon._id}`, {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${generateAccessToken(adminUser)}`
            },
            body: JSON.stringify({
                name: `${ADDON_TEST_PREFIX}updated-item`,
                price: 15,
                note: "After update"
            })
        });

        assert.equal(response.status, 200);
        const updated = (await response.json()) as { name: string; price: number; note: string };
        assert.equal(updated.name, `${ADDON_TEST_PREFIX}updated-item`);
        assert.equal(updated.price, 15);
        assert.equal(updated.note, "After update");

        const dbAddon = await AddonModel.findById(targetAddon._id).lean().exec();
        assert.ok(dbAddon);
        assert.equal(dbAddon.name, `${ADDON_TEST_PREFIX}updated-item`);
        assert.equal(dbAddon.note, "After update");
    });

    test("DELETE /api/addons/:id - removes an addon", async () => {
        const adminUser = await UserModel.create({
            role: "admin",
            name: `Admin Addon ${Date.now()}`,
            email: `admin-addon-route-${Date.now()}@example.com`,
            username: `admin-addon-route-${Date.now()}`,
            authProvider: "local",
            authProviderUserId: `admin-addon-route-${Date.now()}`,
            password: "secure-password",
            emailVerified: true
        });

        const targetAddon = await AddonModel.create({
            name: `${ADDON_TEST_PREFIX}delete-item`,
            price: 4,
            note: "Delete item"
        });

        const deleteResponse = await fetch(`${baseUrl}/${targetAddon._id}`, {
            method: "DELETE",
            headers: {
                authorization: `Bearer ${generateAccessToken(adminUser)}`
            }
        });

        assert.equal(deleteResponse.status, 204);
        const dbAddon = await AddonModel.findById(targetAddon._id).exec();
        assert.equal(dbAddon, null);
    });
});
