import { AppError } from "./AppError.js";

/** 404 Not Found: the requested resource does not exist. */
export class NotFoundError extends AppError {
  constructor(message = "Not Found") {
    super(message, 404);
  }
}
