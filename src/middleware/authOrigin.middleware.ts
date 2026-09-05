import type { RequestHandler } from "express";

import { getAllowedFrontendOrigins } from "../config/auth.js";
import { ForbiddenError } from "../errors/index.js";

export const requireTrustedAuthOrigin: RequestHandler = (request, _response, next) => {
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  const origin = request.header("origin");

  if (!origin || !getAllowedFrontendOrigins().includes(origin)) {
    next(new ForbiddenError("Trusted origin is required"));
    return;
  }

  next();
};
