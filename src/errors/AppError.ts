export type ErrorStatus = "fail" | "error";

/**
 * Base application error.
 *
 * Extends the native Error with the metadata required by the centralized
 * error handler: an HTTP status code, a coarse `status` label ("fail" for 4xx,
 * "error" for 5xx), and an `isOperational` flag that distinguishes expected
 * operational failures from unexpected/programmer errors.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly status: ErrorStatus;
  readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.status = statusCode >= 500 ? "error" : "fail";
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}
