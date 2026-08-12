import assert from "node:assert/strict";
import { test } from "node:test";

import type { NextFunction, Request, Response } from "express";

import { asyncHandler } from "./asyncHandler.js";

const request = {} as Request;
const response = {} as Response;

test("forwards rejected promises to next", async () => {
  const failure = new Error("async failure");
  let forwarded: unknown;
  const next: NextFunction = (error?: unknown) => {
    forwarded = error;
  };

  asyncHandler(async () => {
    throw failure;
  })(request, response, next);

  // Allow the rejected promise microtask to settle.
  await Promise.resolve();

  assert.equal(forwarded, failure);
});

test("does not call next when the handler resolves", async () => {
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };

  asyncHandler(async (_req, res) => {
    (res as unknown as { ok: boolean }).ok = true;
  })(request, response, next);

  await Promise.resolve();

  assert.equal(nextCalled, false);
  assert.equal((response as unknown as { ok: boolean }).ok, true);
});
