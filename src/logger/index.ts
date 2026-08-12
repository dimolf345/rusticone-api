import { join } from "node:path";
import pino, { type TransportTargetOptions } from "pino";
import { redaction } from "./redactor.js";

const consoleTarget: TransportTargetOptions = {
  target: "pino-pretty",
  options: {
    colorize: true,
    destination: 1
  }
};

const rotatingFileTarget: TransportTargetOptions = {
  target: "pino-roll",
  options: {
    file: join(process.cwd(), "logs", "app"),
    frequency: "daily",
    dateFormat: "yyyy-MM-dd",
    mkdir: true,
    limit: {
      count: 13,
      removeOtherLogFiles: true
    }
  }
};

const transport = pino.transport({
  targets: [consoleTarget, rotatingFileTarget]
});

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    redact: redaction
  },
  transport
);