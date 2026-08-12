import { AppError } from "./AppError.js";

/** 403 Forbidden: the authenticated principal lacks the required permissions. */
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}
