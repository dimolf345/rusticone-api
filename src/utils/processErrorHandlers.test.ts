import assert from "node:assert/strict";
import { test } from "node:test";

import type { Logger } from "pino";

import { createProcessErrorHandlers } from "./processErrorHandlers.js";

interface ILogRecord {
  level: "fatal" | "error";
  context: Record<string, unknown>;
  message: string;
}

function createLogger() {
  const records: ILogRecord[] = [];
  const logger = {
    fatal(context: Record<string, unknown>, message: string) {
      records.push({ level: "fatal", context, message });
    },
    error(context: Record<string, unknown>, message: string) {
      records.push({ level: "error", context, message });
    }
  } as unknown as Logger;

  return { logger, records };
}

test("logs uncaught exceptions at fatal, runs shutdown, then exits with 1", async () => {
  const { logger, records } = createLogger();
  const exitCodes: number[] = [];
  let shutdownCalls = 0;

  const handlers = createProcessErrorHandlers({
    logger,
    shutdown: () => {
      shutdownCalls += 1;
    },
    exit: (code) => exitCodes.push(code)
  });

  const error = new Error("boom");
  handlers.uncaughtExceptionHandler(error);

  // Allow the async fatal-error flow to settle.
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(records.length, 1);
  assert.equal(records[0].level, "fatal");
  assert.equal(records[0].context.origin, "uncaughtException");
  assert.equal(records[0].context.err, error);
  assert.equal(shutdownCalls, 1);
  assert.deepEqual(exitCodes, [1]);
});

test("labels unhandled rejections with the unhandledRejection origin", async () => {
  const { logger, records } = createLogger();
  const exitCodes: number[] = [];

  const handlers = createProcessErrorHandlers({
    logger,
    exit: (code) => exitCodes.push(code)
  });

  handlers.unhandledRejectionHandler(new Error("rejected"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(records[0].context.origin, "unhandledRejection");
  assert.deepEqual(exitCodes, [1]);
});

test("still exits when the shutdown routine throws", async () => {
  const { logger, records } = createLogger();
  const exitCodes: number[] = [];

  const handlers = createProcessErrorHandlers({
    logger,
    shutdown: () => {
      throw new Error("cleanup failed");
    },
    exit: (code) => exitCodes.push(code)
  });

  handlers.uncaughtExceptionHandler(new Error("boom"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(
    records.some(
      (record) =>
        record.level === "error" &&
        record.message === "Graceful shutdown failed after fatal error"
    )
  );
  assert.deepEqual(exitCodes, [1]);
});

test("ignores re-entrant fatal errors so shutdown runs once", async () => {
  const { logger } = createLogger();
  const exitCodes: number[] = [];
  let shutdownCalls = 0;

  const handlers = createProcessErrorHandlers({
    logger,
    shutdown: () => {
      shutdownCalls += 1;
    },
    exit: (code) => exitCodes.push(code)
  });

  handlers.uncaughtExceptionHandler(new Error("first"));
  handlers.unhandledRejectionHandler(new Error("second"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(shutdownCalls, 1);
  assert.deepEqual(exitCodes, [1]);
});
