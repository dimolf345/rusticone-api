import { AppError } from "./AppError.js";

/** 400 Bad Request: the request payload or parameters are invalid. */
export class BadRequestError extends AppError {
  constructor(message = "Bad Request") {
    super(message, 400);
  }
}
