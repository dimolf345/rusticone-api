import assert from "node:assert/strict";
import { test } from "node:test";

import { createConsoleTarget } from "./index.js";

test("uses pino-pretty for development console output", () => {
  const target = createConsoleTarget("development");

  assert.equal(target.target, "pino-pretty");
  assert.equal((target.options as { colorize: boolean }).colorize, true);
  assert.equal((target.options as { destination: number }).destination, 1);
});

test("uses raw JSON stdout for production console output", () => {
  const target = createConsoleTarget("production");

  assert.equal(target.target, "pino/file");
  assert.equal((target.options as { destination: number }).destination, 1);
});

test("defaults to pino-pretty when the environment is undefined", () => {
  const target = createConsoleTarget(undefined);

  assert.equal(target.target, "pino-pretty");
});
