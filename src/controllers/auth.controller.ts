import type { Request, Response } from "express";

import { AuthError, authenticateWithGoogle } from "../services/auth.service.js";
import type { GoogleAuthRequestBody, GoogleAuthServiceDependencies } from "../interfaces/auth/index.js";

export function createGoogleAuthController(dependencies: GoogleAuthServiceDependencies = {}) {
    return async (request: Request<unknown, unknown, GoogleAuthRequestBody>, response: Response) => {
        const idToken = request.body.idToken?.trim() ?? "";

        if (!idToken) {
            response.status(400).json({
                message: "idToken is required"
            });
            return;
        }

        console.info("Google auth request received");

        try {
            const authResult = await authenticateWithGoogle(idToken, dependencies);

            console.info(
                `Google auth completed for ${authResult.user.email} (${authResult.isNewUser ? "sign-up" : "login"})`
            );

            response.status(authResult.isNewUser ? 201 : 200).json({
                message: authResult.isNewUser ? "User created with Google sign-up" : "User logged in with Google",
                ...authResult
            });
        } catch (error) {
            const statusCode = error instanceof AuthError ? error.statusCode : 500;
            const message = error instanceof Error ? error.message : "Unexpected authentication error";

            console.error("Google auth failed:", message);

            response.status(statusCode).json({
                message
            });
        }
    };
}
