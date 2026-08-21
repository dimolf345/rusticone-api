import { AppError } from "./AppError.js";

/** 503 Service Unavailable: a required downstream dependency is unreachable. */
export class ServiceUnavailableError extends AppError {
  constructor(message = "Service Unavailable") {
    super(message, 503);
  }
}
