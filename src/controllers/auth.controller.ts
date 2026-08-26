import type { Request, Response } from "express";

import { AUTH_PROVIDERS, UserModel } from "../models/index.js";
import { BASIC_EMAIL_PATTERN } from "../models/user.js";
import type { UserDocument } from "../models/user.js";
import { generateAccessToken, verifyRefreshToken } from "../utils/jwt.js";

import type {
  IAuthenticatedRequest,
  IGoogleAuthRequestBody,
  IGoogleAuthServiceDependencies
} from "../interfaces/auth/index.js";
import { authenticateWithGoogle } from "../services/auth.service.js";
import {
  createSession,
  revokeSessionByRefreshToken,
  rotateRefreshToken
} from "../services/session.service.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError
} from "../errors/index.js";
import {
  getClearRefreshCookieOptions,
  getRefreshCookieOptions,
  REFRESH_COOKIE_NAME
} from "../config/auth.js";
import { parseRefreshCookie } from "../utils/cookies.js";

function setRefreshCookie(response: Response, refreshToken: string, expiresAt?: Date): void {
  const synchronizedExpiry = expiresAt ?? verifyRefreshToken(refreshToken).expiresAt;
  response.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    getRefreshCookieOptions(synchronizedExpiry)
  );
}

function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE_NAME, getClearRefreshCookieOptions());
}

function invalidRefreshToken(response: Response, message = "Refresh token is invalid or expired"): UnauthorizedError {
  clearRefreshCookie(response);
  return new UnauthorizedError(message);
}

export function createGoogleAuthController(dependencies: IGoogleAuthServiceDependencies = {}) {
  return async (request: Request<unknown, unknown, IGoogleAuthRequestBody>, response: Response): Promise<void> => {
    const idToken = request.body.idToken?.trim() ?? "";

    if (!idToken) {
      throw new BadRequestError("idToken is required");
    }

    request.log.info("Google auth request received");

    const { user, isNewUser } = await authenticateWithGoogle(idToken, dependencies);
    const { refreshToken, sessionId } = await createSession(request, user);
    setRefreshCookie(response, refreshToken);

    request.log.info(
      { email: user.email, isNewUser },
      `Google auth completed (${isNewUser ? "sign-up" : "login"})`
    );

    response.status(isNewUser ? 201 : 200).json({
      message: isNewUser ? "User created with Google sign-up" : "User logged in with Google",
      accessToken: generateAccessToken(user, sessionId),
      isNewUser,
      user: serializeUser(user)
    });
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
      : "";

  if (
    !BASIC_EMAIL_PATTERN.test(email) ||
    password.length < 8 ||
    !name
  ) {
    throw new BadRequestError(
      "A valid email, password of at least 8 characters, and name are required"
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
    setRefreshCookie(response, refreshToken);

    request.log.info({ userId: user._id.toString() }, "Local user registered");
    response.status(201).json({
      accessToken: generateAccessToken(user, sessionId),
      user: serializeUser(user)
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
  setRefreshCookie(response, refreshToken);

  request.log.info({ userId: user._id.toString() }, "Local user authenticated");
  response.json({
    accessToken: generateAccessToken(user, sessionId),
    user: serializeUser(user)
  });
}

export async function refreshToken(
  request: Request,
  response: Response
): Promise<void> {
  const token = parseRefreshCookie(request);

  if (!token) {
    throw invalidRefreshToken(response);
  }

  request.log.info("Refreshing access token");
  const rotation = await rotateRefreshToken(token);

  if (rotation.status !== "rotated") {
    throw invalidRefreshToken(response);
  }

  const payload = verifyRefreshToken(rotation.refreshToken);
  const user = await UserModel.findById(payload.userId);

  if (!user) {
    clearRefreshCookie(response);
    await revokeSessionByRefreshToken(rotation.refreshToken);
    throw new UnauthorizedError("Refresh token user no longer exists");
  }

  setRefreshCookie(response, rotation.refreshToken, rotation.expiresAt);
  request.log.info({ userId: user._id.toString() }, "Access token refreshed");
  response.json({ accessToken: generateAccessToken(user, rotation.sessionId) });
}

export async function logout(
  request: Request,
  response: Response
): Promise<void> {
  const token = parseRefreshCookie(request);

  request.log.info("Logging out session");
  clearRefreshCookie(response);
  if (token) {
    await revokeSessionByRefreshToken(token);
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
  response.json({ user: serializeUser(user) });
}
