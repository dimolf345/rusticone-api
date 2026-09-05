import type { RequestHandler } from "express";

import { NotFoundError } from "../errors/index.js";

/**
 * Catch-all handler for requests that match no route.
 *
 * Registered after every router but before the centralized `errorHandler`, it
 * converts an unmatched request into a `NotFoundError` so clients receive the
 * standard JSON error payload instead of Express's default HTML 404.
 */
export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(new NotFoundError(`Cannot ${request.method} ${request.originalUrl}`));
};
