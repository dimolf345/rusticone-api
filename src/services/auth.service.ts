import { OAuth2Client, type TokenPayload } from "google-auth-library";
import jwt from "jsonwebtoken";

import { AUTH_PROVIDERS, USER_ROLES, UserModel, type UserDocument } from "../models/user.js";
import type {
    AuthenticatedGoogleUserResponse,
    GoogleAuthProfile,
    GoogleAuthServiceDependencies,
    SerializedAuthUser
} from "../interfaces/auth/index.js";

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

    const client = new OAuth2Client(googleClientId);

    return async (idToken: string) => {
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

function mapTokenPayloadToProfile(payload: TokenPayload): GoogleAuthProfile {
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
        emailVerified: user.emailVerified,
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

export async function authenticateWithGoogle(
    idToken: string,
    dependencies: GoogleAuthServiceDependencies = {}
): Promise<AuthenticatedGoogleUserResponse> {
    const verifyGoogleIdToken = dependencies.verifyGoogleIdToken ?? createGoogleIdTokenVerifier();
    const jwtSecret = dependencies.jwtSecret ?? defaultJwtSecret;
    const jwtExpiresIn = dependencies.jwtExpiresIn ?? defaultJwtExpiresIn;

    if (!idToken.trim()) {
        throw new AuthError("idToken is required", 400);
    }

    const profile = await verifyGoogleIdToken(idToken);
    const now = new Date();

    const existingUser = await UserModel.findOne({
        $or: [
            {
                authProvider: AUTH_PROVIDERS.Google,
                authProviderUserId: profile.authProviderUserId
            },
            {
                email: profile.email
            }
        ]
    });

    let user: UserDocument;
    let isNewUser = false;

    if (existingUser) {
        existingUser.authProvider = AUTH_PROVIDERS.Google;
        existingUser.authProviderUserId = profile.authProviderUserId;
        existingUser.email = profile.email;
        existingUser.name = profile.name;
        existingUser.avatarUrl = profile.avatarUrl;
        existingUser.emailVerified = profile.emailVerified;
        existingUser.lastLoginAt = now;
        user = await existingUser.save();
    } else {
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
    }

    return {
        accessToken: signAccessToken(user, jwtSecret, jwtExpiresIn),
        isNewUser,
        user: serializeUser(user)
    };
}