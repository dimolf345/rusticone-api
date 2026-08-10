import { join } from "node:path";

import pino, { type TransportTargetOptions } from "pino";

import { redaction } from "./redactor.js";

const consoleTarget: TransportTargetOptions =
  process.env.NODE_ENV === "production"
    ? {
        target: "pino/file",
        options: { destination: 1 }
      }
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          destination: 1,
          translateTime: "SYS:standard"
        }
      };

const transport = pino.transport({
  targets: [
    consoleTarget,
    {
      target: "pino-roll",
      options: {
        file: join(process.cwd(), "logs", "app"),
        frequency: "daily",
        dateFormat: "yyyy-MM-dd",
        mkdir: true,
        limit: {
          count: 14,
          removeOtherLogFiles: true
        }
      }
    }
  ]
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    redact: redaction
  },
  transport
);
