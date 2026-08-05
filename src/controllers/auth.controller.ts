import type { Request, Response } from "express";

import type { AuthenticatedRequest } from "../middleware/auth.middleware.js";
import {
  AUTH_PROVIDERS,
  SessionModel,
  UserModel,
  type UserDocument
} from "../models/index.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} from "../utils/jwt.js";



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
  }
}



class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
  }
}

function serializeUser(user: UserDocument) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    authProvider: user.authProvider,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

async function createSession(request: Request, user: UserDocument) {
  const refreshToken = generateRefreshToken(user);

  await SessionModel.create({
    userId: user._id,
    refreshToken,
    userAgent: request.header("user-agent"),
    ipAddress: request.ip
  });

  return refreshToken;
}

function sendError(
  response: Response,
  error: unknown,
  operation: string
): void {
  const statusCode = error instanceof AuthError ? error.statusCode : 500;
  const message =
    error instanceof AuthError ? error.message : `Unable to ${operation}`;

  console.error(`Authentication ${operation} failed:`, error);
  response.status(statusCode).json({ message });
}

export async function register(
  request: Request,
  response: Response
): Promise<void> {
  const email =
    typeof request.body?.email === "string"
      ? request.body.email.trim().toLowerCase()
      : "";
  const password =
    typeof request.body?.password === "string" ? request.body.password : "";
  const name =
    typeof request.body?.name === "string"
      ? request.body.name.trim()
      : undefined;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
    response.status(400).json({
      message:
        "A valid email and password of at least 8 characters are required"
    });
    return;
  }

  console.info(`Registering local user ${email}`);

  try {
    if (await UserModel.exists({ email })) {
      throw new AuthError("A user with this email already exists", 409);
    }

    const user = await UserModel.create({
      email,
      password,
      name,
      authProvider: AUTH_PROVIDERS.Local
    });
    const refreshToken = await createSession(request, user);

    console.info(`Local user registered: ${user._id.toString()}`);
    response.status(201).json({
      accessToken: generateAccessToken(user),
      refreshToken,
      user: serializeUser(user)
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      sendError(
        response,
        new AuthError("A user with this email already exists", 409),
        "register user"
      );
      return;
    }
    sendError(response, error, "register user");
  }
}

export async function login(
  request: Request,
  response: Response
): Promise<void> {
  const email =
    typeof request.body?.email === "string"
      ? request.body.email.trim().toLowerCase()
      : "";
  const password =
    typeof request.body?.password === "string" ? request.body.password : "";

  if (!email || !password) {
    response.status(400).json({ message: "Email and password are required" });
    return;
  }

  console.info(`Authenticating local user ${email}`);

  try {
    const user = await UserModel.findOne({
      email,
      authProvider: AUTH_PROVIDERS.Local
    }).select("+password");

    if (!user || !(await user.comparePassword(password))) {
      throw new AuthError("Invalid email or password", 401);
    }

    user.lastLoginAt = new Date();
    await user.save();
    const refreshToken = await createSession(request, user);

    console.info(`Local user authenticated: ${user._id.toString()}`);
    response.json({
      accessToken: generateAccessToken(user),
      refreshToken,
      user: serializeUser(user)
    });
  } catch (error) {
    sendError(response, error, "login");
  }
}

export async function refreshToken(
  request: Request,
  response: Response
): Promise<void> {
  const token =
    typeof request.body?.refreshToken === "string"
      ? request.body.refreshToken
      : "";

  if (!token) {
    response.status(400).json({ message: "Refresh token is required" });
    return;
  }

  console.info("Refreshing access token");

  try {
    const payload = verifyRefreshToken(token);
    const session = await SessionModel.findOne({
      refreshToken: token,
      userId: payload.userId
    });

    if (!session) {
      throw new AuthError("Refresh token is invalid or expired", 401);
    }

    const user = await UserModel.findById(payload.userId);

    if (!user) {
      await session.deleteOne();
      throw new AuthError("Refresh token user no longer exists", 401);
    }

    console.info(`Access token refreshed for user ${user._id.toString()}`);
    response.json({ accessToken: generateAccessToken(user) });
  } catch (error) {
    if (!(error instanceof AuthError)) {
      sendError(
        response,
        new AuthError("Refresh token is invalid or expired", 401),
        "refresh token"
      );
      return;
    }
    sendError(response, error, "refresh token");
  }
}

export async function logout(
  request: Request,
  response: Response
): Promise<void> {
  const token =
    typeof request.body?.refreshToken === "string"
      ? request.body.refreshToken
      : "";

  if (!token) {
    response.status(400).json({ message: "Refresh token is required" });
    return;
  }

  console.info("Logging out session");
  try {
    await SessionModel.deleteOne({ refreshToken: token });
    console.info("Session logged out");
    response.status(204).send();
  } catch (error) {
    sendError(response, error, "logout");
  }
}

export async function me(request: Request, response: Response): Promise<void> {
  const { userId } = (request as AuthenticatedRequest).user;

  try {
    const user = await UserModel.findById(userId);

    if (!user) {
      response.status(404).json({ message: "User not found" });
      return;
    }

    console.info(`Returning profile for user ${userId}`);
    response.json({ user: serializeUser(user) });
  } catch (error) {
    sendError(response, error, "load user profile");
  }
}
