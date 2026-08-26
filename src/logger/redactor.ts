import type { LoggerOptions } from "pino";

export const redaction: LoggerOptions["redact"] = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    "body.password",
    "body.refreshToken",
    "body.token",
    "*.creditCard"
  ],
  censor: "[REDACTED]"
};
