import { AppError } from "./AppError.js";

/**
 * 500 Internal Server Error.
 *
 * Defaults to `isOperational = false` so the centralized error handler logs it
 * at `error` level with a stack trace and hides the message from clients in
 * production.
 */
export class InternalServerError extends AppError {
  constructor(message = "Internal Server Error", isOperational = false) {
    super(message, 500, isOperational);
  }
}
