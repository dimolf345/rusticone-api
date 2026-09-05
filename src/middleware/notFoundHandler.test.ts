import assert from "node:assert/strict";
import { test } from "node:test";

import type { Request, Response } from "express";

import { notFoundHandler } from "./notFoundHandler.js";
import { NotFoundError } from "../errors/index.js";

function createRequest(method: string, originalUrl: string) {
  return { method, originalUrl } as unknown as Request;
}

const response = {} as Response;

test("forwards a NotFoundError describing the unmatched route", () => {
  let forwarded: unknown;
  const next = (error?: unknown) => {
    forwarded = error;
  };

  notFoundHandler(createRequest("GET", "/api/unknown"), response, next);

  assert.ok(forwarded instanceof NotFoundError);
  assert.equal((forwarded as NotFoundError).statusCode, 404);
  assert.equal((forwarded as NotFoundError).message, "Cannot GET /api/unknown");
});

test("includes the HTTP method in the error message", () => {
  let forwarded: unknown;
  const next = (error?: unknown) => {
    forwarded = error;
  };

  notFoundHandler(createRequest("POST", "/api/missing"), response, next);

  assert.equal((forwarded as NotFoundError).message, "Cannot POST /api/missing");
});
