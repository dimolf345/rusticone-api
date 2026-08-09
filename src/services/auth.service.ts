import jwt from "jsonwebtoken";

import { AUTH_PROVIDERS, USER_ROLES, UserModel, type UserDocument } from "../models/user.js";
import type {
    AuthenticatedGoogleUserResponse,
    GoogleAuthProfile,
    GoogleAuthServiceDependencies,
    SerializedAuthUser
} from "../interfaces/auth/index.js";

type GoogleTokenPayload = {
    email?: string;
    name?: string;
    sub?: string;
    picture?: string;
    email_verified?: boolean;
};

const defaultJwtSecret = process.env.JWT_SECRET ?? "rusticone-dev-session-secret";
const defaultJwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "7d";

export class AuthError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = "AuthError";
        this.statusCode = statusCode;
    }
}

function createGoogleIdTokenVerifier(): (idToken: string) => Promise<GoogleAuthProfile> {
    const googleClientId = process.env.GOOGLE_CLIENT_ID;

    if (!googleClientId) {
        throw new AuthError("GOOGLE_CLIENT_ID is required to verify Google sign-in", 500);
    }

    return async (idToken: string) => {
        const googleAuthLibraryModule = "google-auth-library";
        const { OAuth2Client } = await import(googleAuthLibraryModule);
        const client = new OAuth2Client(googleClientId);

        const ticket = await client.verifyIdToken({
            idToken,
            audience: googleClientId
        });

        const payload = ticket.getPayload();

        if (!payload) {
            throw new AuthError("Unable to verify the Google token", 400);
        }

        return mapTokenPayloadToProfile(payload);
    };
}

function mapTokenPayloadToProfile(payload: GoogleTokenPayload): GoogleAuthProfile {
    const email = payload.email?.trim().toLowerCase();
    const name = payload.name?.trim();
    const authProviderUserId = payload.sub?.trim();

    if (!email || !name || !authProviderUserId) {
        throw new AuthError("Google token is missing required profile fields", 400);
    }

    return {
        authProviderUserId,
        email,
        name,
        avatarUrl: payload.picture ?? undefined,
        emailVerified: Boolean(payload.email_verified)
    };
}

function serializeUser(user: UserDocument): SerializedAuthUser {
    return {
        id: user._id.toString(),
        role: user.role,
        email: user.email,
        name: user.name,
        authProvider: user.authProvider,
        authProviderUserId: user.authProviderUserId,
        avatarUrl: user.avatarUrl,
        emailVerified: Boolean(user.emailVerified),
        lastLoginAt: user.lastLoginAt?.toISOString(),
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString()
    };
}

function signAccessToken(user: UserDocument, jwtSecret: string, jwtExpiresIn: string | number): string {
    return jwt.sign(
        {
            sub: user._id.toString(),
            email: user.email,
            role: user.role,
            authProvider: user.authProvider
        },
        jwtSecret,
        {
            expiresIn: jwtExpiresIn as jwt.SignOptions["expiresIn"]
        }
    );
}

function resolveJwtSecret(suppliedSecret?: string): string {
    const secret = suppliedSecret ?? process.env.JWT_SECRET;

    if (!secret) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("JWT_SECRET environment variable is missing in production.");
        }
        return defaultJwtSecret;
    }

    return secret;
}

export async function authenticateWithGoogle(
    idToken: string,
    dependencies: GoogleAuthServiceDependencies = {}
): Promise<AuthenticatedGoogleUserResponse> {
    const verifyGoogleIdToken = dependencies.verifyGoogleIdToken ?? createGoogleIdTokenVerifier();
    const jwtSecret = resolveJwtSecret(dependencies.jwtSecret);
    const jwtExpiresIn = dependencies.jwtExpiresIn ?? defaultJwtExpiresIn;

    if (!idToken.trim()) {
        throw new AuthError("idToken is required", 400);
    }

    const profile = await verifyGoogleIdToken(idToken);
    const now = new Date();

    // Fetch up to 2 matches to detect ambiguous identity states
    const matchingUsers = await UserModel.find({
        $or: [
            {
                authProvider: AUTH_PROVIDERS.Google,
                authProviderUserId: profile.authProviderUserId
            },
            {
                email: profile.email
            }
        ]
    }).limit(2);

    let user: UserDocument;
    let isNewUser = false;

    if (matchingUsers.length === 0) {
        // Case 1: Brand new user
        user = await UserModel.create({
            role: USER_ROLES.Customer,
            email: profile.email,
            name: profile.name,
            authProvider: AUTH_PROVIDERS.Google,
            authProviderUserId: profile.authProviderUserId,
            avatarUrl: profile.avatarUrl,
            emailVerified: profile.emailVerified,
            lastLoginAt: now
        });
        isNewUser = true;
    } else if (matchingUsers.length === 1) {
        // Case 2: Unambiguous match
        const matchedUser = matchingUsers[0];

        // Fail fast if an existing account has this email but belongs to a different Google ID
        if (
            matchedUser.authProvider === AUTH_PROVIDERS.Google &&
            matchedUser.authProviderUserId !== profile.authProviderUserId
        ) {
            throw new AuthError("Email is associated with a different Google account.", 409);
        }

        matchedUser.authProvider = AUTH_PROVIDERS.Google;
        matchedUser.authProviderUserId = profile.authProviderUserId;
        matchedUser.email = profile.email;
        matchedUser.name = profile.name;
        matchedUser.avatarUrl = profile.avatarUrl;
        matchedUser.emailVerified = profile.emailVerified;
        matchedUser.lastLoginAt = now;
        user = await matchedUser.save();
    } else {
        // Case 3: Ambiguous match (1 user matched on email, 1 matched on Google ID)
        throw new AuthError(
            "Ambiguous identity: multiple accounts match the provider ID and email.",
            409
        );
    }

    return {
        accessToken: signAccessToken(user, jwtSecret, jwtExpiresIn),
        isNewUser,
        user: serializeUser(user)
    };
}