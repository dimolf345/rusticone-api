import { AppError } from "./AppError.js";

/** 409 Conflict: the request conflicts with the current resource state. */
export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}
