import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";

import express from "express";
import mongoose from "mongoose";

import { connectDatabase } from "../config/database.js";
import { openApiDocument } from "../openapi.js";
import { UserModel } from "../models/user.js";
import { createAuthRouter } from "./auth.js";

const testGoogleProfile = {
    authProviderUserId: "google-user-123",
    email: "customer@example.com",
    name: "Customer Example",
    avatarUrl: "https://example.com/avatar.png",
    emailVerified: true
};

function createTestApp() {
    const app = express();

    app.use(express.json());
    app.use(
        "/auth",
        createAuthRouter({
            verifyGoogleIdToken: async (idToken: string) => {
                assert.equal(idToken, "valid-google-token");
                return testGoogleProfile;
            },
            jwtSecret: "test-secret",
            jwtExpiresIn: "1h"
        })
    );
    app.get("/openapi.json", (_request, response) => response.json(openApiDocument));

    return app;
}

describe("Google auth flow", () => {
    before(async () => {
        await connectDatabase();
    });

    after(async () => {
        await mongoose.disconnect();
    });

    afterEach(async () => {
        await UserModel.deleteMany({ authProviderUserId: testGoogleProfile.authProviderUserId });
    });

    test("creates a user on first Google sign-up and logs in on the second request", async () => {
        const app = createTestApp();
        const server = app.listen(0);

        try {
            const address = server.address();

            if (!address || typeof address === "string") {
                throw new Error("Unable to determine test server address");
            }

            const baseUrl = `http://127.0.0.1:${address.port}`;

            const firstResponse = await fetch(`${baseUrl}/auth/google`, {
                method: "POST",
                headers: {
                    "content-type": "application/json"
                },
                body: JSON.stringify({ idToken: "valid-google-token" })
            });

            assert.equal(firstResponse.status, 201);

            const firstBody = (await firstResponse.json()) as {
                isNewUser: boolean;
                user: { email: string; authProvider: string };
                accessToken: string;
            };

            assert.equal(firstBody.isNewUser, true);
            assert.equal(firstBody.user.email, testGoogleProfile.email);
            assert.equal(firstBody.user.authProvider, "google");
            assert.equal(typeof firstBody.accessToken, "string");

            const secondResponse = await fetch(`${baseUrl}/auth/google`, {
                method: "POST",
                headers: {
                    "content-type": "application/json"
                },
                body: JSON.stringify({ idToken: "valid-google-token" })
            });

            assert.equal(secondResponse.status, 200);

            const secondBody = (await secondResponse.json()) as {
                isNewUser: boolean;
                user: { email: string; authProvider: string };
            };

            assert.equal(secondBody.isNewUser, false);
            assert.equal(secondBody.user.email, testGoogleProfile.email);
            assert.equal(secondBody.user.authProvider, "google");

            const storedUsers = await UserModel.find({ email: testGoogleProfile.email });
            assert.equal(storedUsers.length, 1);
        } finally {
            server.close();
        }
    });

    test("exposes the OpenAPI document with the Google auth path", async () => {
        const app = createTestApp();
        const server = app.listen(0);

        try {
            const address = server.address();

            if (!address || typeof address === "string") {
                throw new Error("Unable to determine test server address");
            }

            const response = await fetch(`http://127.0.0.1:${address.port}/openapi.json`);
            assert.equal(response.status, 200);

            const body = (await response.json()) as { paths: Record<string, unknown> };
            assert.ok(body.paths["/auth/google"]);
        } finally {
            server.close();
        }
    });
});
