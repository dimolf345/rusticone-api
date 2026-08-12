import type { ErrorRequestHandler, Request } from "express";

import { AppError } from "../errors/index.js";
import { logger } from "../logger/index.js";

const GENERIC_ERROR_MESSAGE = "Internal Server Error";

/** Extracts the request-scoped Pino logger, falling back to the root logger. */
function resolveLogger(request: Request) {
  return request.log ?? logger;
}

/**
 * Centralized Express error handler.
 *
 * - Normalizes any thrown value into an HTTP status code and safe message.
 * - Logs operational errors at `warn` and unexpected errors at `error` (with
 *   the serialized `err` object so Pino captures the stack trace).
 * - Never leaks internal messages or stack traces to clients in production.
 */
export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  // `next` is required for Express to treat this as an error handler.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next
) => {
  const isProduction = process.env.NODE_ENV === "production";
  const isAppError = error instanceof AppError;

  const statusCode = isAppError ? error.statusCode : 500;
  const status = statusCode >= 500 ? "error" : "fail";
  const isOperational = isAppError ? error.isOperational : false;

  const log = resolveLogger(request);
  const logContext = {
    err: error,
    reqId: request.id,
    path: request.originalUrl
  };

  if (isOperational) {
    log.warn(logContext, "Operational error handled");
  } else {
    log.error(logContext, "Unhandled error");
  }

  // Only expose the real message for operational errors, or in non-production
  // environments to aid debugging. Unexpected production errors stay generic.
  const exposeMessage = isOperational || !isProduction;
  const message =
    exposeMessage && error instanceof Error
      ? error.message
      : GENERIC_ERROR_MESSAGE;

  response.status(statusCode).json({
    success: false,
    status,
    message,
    requestId: request.id
  });
};
