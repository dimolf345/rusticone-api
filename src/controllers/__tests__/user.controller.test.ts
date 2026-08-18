import assert from "node:assert/strict";
import { test } from "node:test";

import type { IBaseServiceInterface } from "../interfaces/base.interface.js";
import type {
  CreateUserInput,
  IStoredUser,
  UpdateUserInput
} from "../interfaces/user/index.js";
import { BaseController } from "./base.controller.js";
import { UserController } from "./user.controller.js";

test("UserController is a concrete BaseController for users", () => {
  const service: IBaseServiceInterface<
    IStoredUser,
    CreateUserInput,
    UpdateUserInput
  > = {
    createOne: async () => ({}) as IStoredUser,
    findAll: async () => ({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 }
    }),
    findOne: async () => null,
    update: async () => null,
    delete: async () => null
  };
  const controller = new UserController(service);

  assert.ok(controller instanceof BaseController);
  assert.equal(typeof controller.createOne, "function");
  assert.equal(typeof controller.findAll, "function");
  assert.equal(typeof controller.findOne, "function");
  assert.equal(typeof controller.update, "function");
  assert.equal(typeof controller.delete, "function");
});
