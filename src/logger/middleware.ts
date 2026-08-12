import { randomUUID } from "node:crypto";

import type { Logger } from "pino";
import { pinoHttp } from "pino-http";

import { logger } from "./index.js";

export function createLoggingMiddleware(httpLogger: Logger = logger) {
  return pinoHttp({
    logger: httpLogger,
    genReqId(request, response) {
      const suppliedId = request.headers["x-correlation-id"];
      const correlationId =
        typeof suppliedId === "string" && suppliedId.trim().length > 0
          ? suppliedId
          : randomUUID();

      response.setHeader("x-correlation-id", correlationId);
      return correlationId;
    },
    customProps(request) {
      return { correlationId: request.id };
    },
    customLogLevel(_request, response, error) {
      if (error || response.statusCode >= 500) {
        return "error";
      }

      if (response.statusCode >= 400) {
        return "warn";
      }

      return "info";
    }
  });
}

export const loggingMiddleware = createLoggingMiddleware();
