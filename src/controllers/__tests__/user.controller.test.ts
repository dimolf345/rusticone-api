import assert from "node:assert/strict";
import { test } from "node:test";

import type { Request, Response } from "express";

import { ForbiddenError, UnauthorizedError } from "../../errors/index.js";
import type { IBaseServiceInterface } from "../../interfaces/base.interface.js";
import type {
  CreateUserInput,
  IStoredUser,
  UpdateUserInput
} from "../../interfaces/user/index.js";
import { BaseController } from "../base.controller.js";
import { UserController } from "../user.controller.js";

type UserService = IBaseServiceInterface<
  IStoredUser,
  CreateUserInput,
  UpdateUserInput
>;

function createService(overrides: Partial<UserService> = {}): UserService {
  return {
    createOne: async () => ({}) as IStoredUser,
    findAll: async () => ({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
    }),
    findOne: async () => null,
    update: async () => null,
    delete: async () => null,
    ...overrides
  };
}

interface IMockResponse extends Response {
  statusCode?: number;
  body?: unknown;
}

function createUpdateRequest(options: {
  id: string;
  body: UpdateUserInput;
  user?: { userId: string; role: string };
}): Request<{ id: string }, unknown, UpdateUserInput> {
  return {
    params: { id: options.id },
    body: options.body,
    user: options.user,
    log: { info() {}, warn() {} }
  } as unknown as Request<{ id: string }, unknown, UpdateUserInput>;
}

function createMockResponse(): IMockResponse {
  const response = {
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    }
  } as IMockResponse;
  return response;
}

test("UserController is a concrete BaseController for users", () => {
  const controller = new UserController(createService());

  assert.ok(controller instanceof BaseController);
  assert.equal(typeof controller.createOne, "function");
  assert.equal(typeof controller.findAll, "function");
  assert.equal(typeof controller.findOne, "function");
  assert.equal(typeof controller.update, "function");
  assert.equal(typeof controller.delete, "function");
});

test("update lets a customer edit their own profile", async () => {
  const updated = { _id: "user-1", role: "customer" } as IStoredUser;
  const controller = new UserController(
    createService({ update: async () => updated })
  );
  const request = createUpdateRequest({
    id: "user-1",
    body: { name: "New Name" },
    user: { userId: "user-1", role: "customer" }
  });
  const response = createMockResponse();

  await controller.update(request, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, updated);
});

test("update forbids a customer from editing another user", async () => {
  const controller = new UserController(createService());
  const request = createUpdateRequest({
    id: "user-2",
    body: { name: "New Name" },
    user: { userId: "user-1", role: "customer" }
  });

  await assert.rejects(
    () => controller.update(request, createMockResponse()),
    ForbiddenError
  );
});

test("update forbids a customer from changing their role", async () => {
  const controller = new UserController(createService());
  const request = createUpdateRequest({
    id: "user-1",
    body: { role: "admin" },
    user: { userId: "user-1", role: "customer" }
  });

  await assert.rejects(
    () => controller.update(request, createMockResponse()),
    UnauthorizedError
  );
});

test("update lets a customer send their own role unchanged", async () => {
  const updated = { _id: "user-1", role: "customer" } as IStoredUser;
  const controller = new UserController(
    createService({ update: async () => updated })
  );
  const request = createUpdateRequest({
    id: "user-1",
    body: { role: "customer", name: "Same Role" },
    user: { userId: "user-1", role: "customer" }
  });
  const response = createMockResponse();

  await controller.update(request, response);

  assert.equal(response.statusCode, 200);
});

test("update lets an admin edit another user and change their role", async () => {
  const updated = { _id: "user-2", role: "admin" } as IStoredUser;
  const controller = new UserController(
    createService({ update: async () => updated })
  );
  const request = createUpdateRequest({
    id: "user-2",
    body: { role: "admin" },
    user: { userId: "admin-1", role: "admin" }
  });
  const response = createMockResponse();

  await controller.update(request, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, updated);
});
