import type { Request, Response } from "express";

import {
  AUTH_PROVIDERS,
  SessionModel,
  UserModel
} from "../models/index.js";
import { generateAccessToken, verifyRefreshToken } from "../utils/jwt.js";

import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError
} from "../errors/index.js";
import type {
  IAuthenticatedRequest,
  IGoogleAuthRequestBody,
  IGoogleAuthServiceDependencies
} from "../interfaces/auth/index.js";
import { authenticateWithGoogle } from "../services/auth.service.js";
import {
  createSession,
  invalidateSessionCache,
  revokeSessionsFromOtherIps
} from "../services/session.service.js";

export function createGoogleAuthController(dependencies: IGoogleAuthServiceDependencies = {}) {
  return async (request: Request<unknown, unknown, IGoogleAuthRequestBody>, response: Response): Promise<void> => {
    const idToken = request.body.idToken?.trim() ?? "";

    if (!idToken) {
      throw new BadRequestError("idToken is required");
    }

    request.log.info("Google auth request received");

    const { user, isNewUser } = await authenticateWithGoogle(idToken, dependencies);
    const { refreshToken, sessionId } = await createSession(request, user);
    await revokeSessionsFromOtherIps(user._id, request.ip);

    request.log.info(
      { email: user.email, isNewUser },
      `Google auth completed (${isNewUser ? "sign-up" : "login"})`
    );

    response.status(isNewUser ? 201 : 200).json({
      message: isNewUser ? "User created with Google sign-up" : "User logged in with Google",
      accessToken: generateAccessToken(user, sessionId),
      refreshToken,
      isNewUser,
      user: user.toJSON()
    });
  }
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
    throw new BadRequestError(
      "A valid email and password of at least 8 characters are required"
    );
  }

  request.log.info({ email }, "Registering local user");

  try {
    if (await UserModel.exists({ email })) {
      throw new ConflictError("A user with this email already exists");
    }

    const user = await UserModel.create({
      email,
      password,
      name,
      authProvider: AUTH_PROVIDERS.Local,
      authProviderUserId: email
    });
    const { refreshToken, sessionId } = await createSession(request, user);
    await revokeSessionsFromOtherIps(user._id, request.ip);

    request.log.info({ userId: user._id.toString() }, "Local user registered");
    response.status(201).json({
      accessToken: generateAccessToken(user, sessionId),
      refreshToken,
      user: user.toJSON()
    });
  } catch (error) {
    // Translate the MongoDB duplicate-key error into a typed conflict error.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new ConflictError("A user with this email already exists");
    }
    throw error;
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
    throw new BadRequestError("Email and password are required");
  }

  request.log.info({ email }, "Authenticating local user");

  const user = await UserModel.findOne({
    email,
    authProvider: AUTH_PROVIDERS.Local
  }).select("+password");

  if (!user || !(await user.comparePassword(password))) {
    throw new UnauthorizedError("Invalid email or password");
  }

  user.lastLoginAt = new Date();
  await user.save();
  const { refreshToken, sessionId } = await createSession(request, user);
  await revokeSessionsFromOtherIps(user._id, request.ip);

  request.log.info({ userId: user._id.toString() }, "Local user authenticated");
  response.json({
    accessToken: generateAccessToken(user, sessionId),
    refreshToken,
    user: user.toJSON()
  });
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
    throw new BadRequestError("Refresh token is required");
  }

  request.log.info("Refreshing access token");

  try {
    const payload = verifyRefreshToken(token);
    const session = await SessionModel.findOne({
      refreshToken: token,
      userId: payload.userId
    });

    if (!session) {
      throw new UnauthorizedError("Refresh token is invalid or expired");
    }

    const user = await UserModel.findById(payload.userId);

    if (!user) {
      await session.deleteOne();
      await invalidateSessionCache(session._id.toString());
      throw new UnauthorizedError("Refresh token user no longer exists");
    }

    request.log.info({ userId: user._id.toString() }, "Access token refreshed");
    response.json({ accessToken: generateAccessToken(user, session._id.toString()) });
  } catch (error) {
    // Preserve typed application errors; normalize token verification failures.
    if (error instanceof AppError) {
      throw error;
    }
    throw new UnauthorizedError("Refresh token is invalid or expired");
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
    throw new BadRequestError("Refresh token is required");
  }

  request.log.info("Logging out session");
  const session = await SessionModel.findOneAndDelete({ refreshToken: token });

  if (session) {
    await invalidateSessionCache(session._id.toString());
  }

  request.log.info("Session logged out");
  response.status(204).send();
}

export async function me(request: Request, response: Response): Promise<void> {
  const { userId } = (request as IAuthenticatedRequest)?.user || {};

  const user = await UserModel.findById(userId);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  request.log.info({ userId }, "Returning profile for user");
  response.json({ user: user.toJSON() });
}
