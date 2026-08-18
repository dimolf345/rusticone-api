import type { Logger } from "pino";
import { pinoHttp } from "pino-http";

import { logger } from "./index.js";

export function createLoggingMiddleware(httpLogger: Logger = logger) {
  return pinoHttp({
    logger: httpLogger,

    // Custom serializers strip out request/response headers and connection noise
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url,
          ...(Object.keys(req.query || {}).length > 0 && { query: req.query })
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode
        };
      }
    },

    // Simplifies the log message summary
    customSuccessMessage(req, res, responseTime) {
      return `${req.method} ${req.url} ${res.statusCode} - ${responseTime}ms`;
    }
  });
}

export const loggingMiddleware = createLoggingMiddleware();
