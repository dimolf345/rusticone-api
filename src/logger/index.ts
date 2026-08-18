import { join } from "node:path";
import pino, { type TransportTargetOptions } from "pino";
import { redaction } from "./redactor.js";

/**
 * Builds the console transport target for the active environment.
 *
 * Development uses `pino-pretty` for human-readable output, while production
 * emits raw single-line JSON to stdout (destination 1) so log aggregators such
 * as Datadog or ELK can ingest it directly.
 */
export function createConsoleTarget(
  nodeEnv = process.env.NODE_ENV
): TransportTargetOptions {
  if (nodeEnv === "production") {
    return {
      target: "pino/file",
      options: { destination: 1 }
    };
  }

  return {
    target: "pino-pretty",
    options: {
      colorize: true,
      destination: 1,
      // Formats timestamp in local readable date/time for CLI
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
      // Suppresses verbose system metadata in dev terminal
      ignore: "pid,hostname,req.headers,res.headers"
    }
  };
}

const consoleTarget: TransportTargetOptions = createConsoleTarget();

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
    redact: redaction,
    // Converts default Unix epoch integer to standard ISO 8601 date string
    timestamp: pino.stdTimeFunctions.isoTime
  },
  transport
);