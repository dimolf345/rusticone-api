import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import type { NextFunction, Request, Response } from "express";

import { errorHandler } from "./errorHandler.js";
import {
  BadRequestError,
  InternalServerError,
  NotFoundError
} from "../errors/index.js";

interface LogRecord {
  level: "warn" | "error";
  context: Record<string, unknown>;
  message: string;
}

function createRequest(overrides: Partial<Request> = {}) {
  const records: LogRecord[] = [];
  const log = {
    warn(context: Record<string, unknown>, message: string) {
      records.push({ level: "warn", context, message });
    },
    error(context: Record<string, unknown>, message: string) {
      records.push({ level: "error", context, message });
    }
  };

  const request = {
    id: "req-12345",
    originalUrl: "/api/resource",
    log,
    ...overrides
  } as unknown as Request;

  return { request, records };
}

function createResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    }
  } as unknown as Response & { statusCode: number; body: unknown };

  return response;
}

const noopNext: NextFunction = () => undefined;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

test("formats operational AppError responses and logs at warn", () => {
  const { request, records } = createRequest();
  const response = createResponse();

  errorHandler(new NotFoundError("User not found"), request, response, noopNext);

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, {
    success: false,
    status: "fail",
    message: "User not found",
    requestId: "req-12345"
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].level, "warn");
  assert.equal(records[0].context.reqId, "req-12345");
  assert.equal(records[0].context.path, "/api/resource");
});

test("uses 'error' status label for operational 5xx errors", () => {
  const { request } = createRequest();
  const response = createResponse();

  errorHandler(
    new InternalServerError("Boom", true),
    request,
    response,
    noopNext
  );

  assert.equal(response.statusCode, 500);
  assert.equal((response.body as { status: string }).status, "error");
});

test("logs 4xx operational errors at warn", () => {
  const { request, records } = createRequest();
  const response = createResponse();

  errorHandler(new BadRequestError("Invalid"), request, response, noopNext);

  assert.equal(response.statusCode, 400);
  assert.equal(records[0].level, "warn");
});

test("logs unexpected errors at error level and hides message in production", () => {
  process.env.NODE_ENV = "production";
  const { request, records } = createRequest();
  const response = createResponse();

  errorHandler(new Error("secret db string"), request, response, noopNext);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    success: false,
    status: "error",
    message: "Internal Server Error",
    requestId: "req-12345"
  });

  assert.equal(records[0].level, "error");
  // The internal message must never leak to the client in production.
  assert.doesNotMatch(JSON.stringify(response.body), /secret db string/);
  // But the original error is still logged for observability.
  assert.equal((records[0].context.err as Error).message, "secret db string");
});

test("exposes unexpected error messages outside production", () => {
  process.env.NODE_ENV = "development";
  const { request } = createRequest();
  const response = createResponse();

  errorHandler(new Error("verbose debug detail"), request, response, noopNext);

  assert.equal(response.statusCode, 500);
  assert.equal(
    (response.body as { message: string }).message,
    "verbose debug detail"
  );
});
