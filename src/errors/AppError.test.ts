import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError
} from "./index.js";

test("AppError sets defaults and captures a stack trace", () => {
  const error = new AppError("boom");

  assert.equal(error.message, "boom");
  assert.equal(error.statusCode, 500);
  assert.equal(error.status, "error");
  assert.equal(error.isOperational, true);
  assert.equal(error.name, "AppError");
  assert.ok(error instanceof Error);
  assert.match(error.stack ?? "", /boom/);
});

test("AppError derives 'fail' status for 4xx codes", () => {
  const error = new AppError("bad", 422);

  assert.equal(error.statusCode, 422);
  assert.equal(error.status, "fail");
});

test("HTTP subclasses set the correct status codes and labels", () => {
  const cases: Array<[AppError, number, "fail" | "error", string]> = [
    [new BadRequestError(), 400, "fail", "BadRequestError"],
    [new UnauthorizedError(), 401, "fail", "UnauthorizedError"],
    [new ForbiddenError(), 403, "fail", "ForbiddenError"],
    [new NotFoundError(), 404, "fail", "NotFoundError"],
    [new ConflictError(), 409, "fail", "ConflictError"],
    [new InternalServerError(), 500, "error", "InternalServerError"]
  ];

  for (const [error, statusCode, status, name] of cases) {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, statusCode);
    assert.equal(error.status, status);
    assert.equal(error.name, name);
  }
});

test("InternalServerError is non-operational by default", () => {
  assert.equal(new InternalServerError().isOperational, false);
  assert.equal(new InternalServerError("known", true).isOperational, true);
});

test("subclasses accept custom messages", () => {
  assert.equal(new NotFoundError("User not found").message, "User not found");
  assert.equal(new BadRequestError().message, "Bad Request");
});
