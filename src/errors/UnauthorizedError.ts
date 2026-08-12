import { AppError } from "./AppError.js";

/** 401 Unauthorized: authentication is missing or invalid. */
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}
