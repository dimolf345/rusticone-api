import assert from "node:assert/strict";
import { test } from "node:test";

import type { Response } from "express";

import { BaseController } from "./base.controller.js";
import type {
  BaseServiceInterface,
  FindAllOptions
} from "../interfaces/base.interface.js";

interface Item {
  id: string;
  name: string;
}

type CreateItem = Omit<Item, "id">;
type UpdateItem = Partial<CreateItem>;

class TestController extends BaseController<Item, CreateItem, UpdateItem> {}

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
    },
    send() {
      return response;
    }
  } as unknown as Response & { statusCode: number; body: unknown };

  return response;
}

function createService(
  overrides: Partial<BaseServiceInterface<Item, CreateItem, UpdateItem>> = {}
) {
  return {
    createOne: async (data: CreateItem) => ({ id: "1", ...data }),
    findAll: async () => ({
      data: [{ id: "1", name: "Pizza" }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    }),
    findOne: async (id: string) => ({ id, name: "Pizza" }),
    update: async (id: string, data: UpdateItem) => ({
      id,
      name: data.name ?? "Pizza"
    }),
    delete: async (id: string) => ({ id, name: "Pizza" }),
    ...overrides
  } satisfies BaseServiceInterface<Item, CreateItem, UpdateItem>;
}

const request = <T>(value: T) => value as never;

test("BaseController handles successful CRUD responses", async () => {
  let findAllOptions: FindAllOptions<Item> | undefined;
  const controller = new TestController(
    createService({
      findAll: async (options) => {
        findAllOptions = options;
        return {
          data: [{ id: "1", name: "Pizza" }],
          pagination: { page: 2, limit: 10, total: 1, totalPages: 1 }
        };
      }
    }),
    "item"
  );
  const createResponseValue = createResponse();
  await controller.createOne(
    request({ body: { name: "Pizza" } }),
    createResponseValue
  );
  assert.equal(createResponseValue.statusCode, 201);
  assert.deepEqual(createResponseValue.body, { id: "1", name: "Pizza" });

  const findAllResponse = createResponse();
  await controller.findAll(
    request({
      query: {
        page: "2",
        limit: "10",
        name: ["Pizza", "Pasta"],
        $where: "unsafe",
        "profile.name": "unsafe"
      }
    }),
    findAllResponse
  );
  assert.equal(findAllResponse.statusCode, 200);
  assert.deepEqual(findAllOptions, {
    filter: { name: { $in: ["Pizza", "Pasta"] } },
    page: 2,
    limit: 10
  });
  assert.deepEqual(findAllResponse.body, {
    data: [{ id: "1", name: "Pizza" }],
    pagination: { page: 2, limit: 10, total: 1, totalPages: 1 }
  });

  const findOneResponse = createResponse();
  await controller.findOne(request({ params: { id: "1" } }), findOneResponse);
  assert.equal(findOneResponse.statusCode, 200);

  const updateResponse = createResponse();
  await controller.update(
    request({ params: { id: "1" }, body: { name: "Pasta" } }),
    updateResponse
  );
  assert.equal(updateResponse.statusCode, 200);
  assert.deepEqual(updateResponse.body, { id: "1", name: "Pasta" });

  const deleteResponse = createResponse();
  await controller.delete(request({ params: { id: "1" } }), deleteResponse);
  assert.equal(deleteResponse.statusCode, 204);
});

test("BaseController returns 404 when an entity does not exist", async () => {
  const controller = new TestController(
    createService({
      findOne: async () => null,
      update: async () => null,
      delete: async () => null
    }),
    "item"
  );
  const response = createResponse();

  await controller.findOne(request({ params: { id: "missing" } }), response);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { message: "item not found" });
});

test("BaseController returns 500 when a service operation fails", async () => {
  const controller = new TestController(
    createService({
      findAll: async () => {
        throw new Error("database unavailable");
      }
    }),
    "item"
  );
  const response = createResponse();

  await controller.findAll(request({ query: {} }), response);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { message: "database unavailable" });
});
