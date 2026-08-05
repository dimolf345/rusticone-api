import assert from "node:assert/strict";
import { test } from "node:test";

import { BaseService } from "./base.service.js";
import type { Model } from "mongoose";

interface Item {
  id: string;
  name: string;
}

class TestService extends BaseService<
  Item,
  Omit<Item, "id">,
  Partial<Omit<Item, "id">>
> {
  constructor(model: Model<Item>) {
    super(model);
  }
}

function createModel() {
  const calls: Array<[string, ...unknown[]]> = [];
  const result = (value: unknown) => ({ exec: async () => value });
  const model = {
    create: async (data: Omit<Item, "id">) => ({ id: "1", ...data }),
    find: (filter: unknown) => {
      calls.push(["find", filter]);
      return {
        skip: (value: number) => {
          calls.push(["skip", value]);
          return {
            limit: (limit: number) => {
              calls.push(["limit", limit]);
              return result([{ id: "1", name: "Pizza" }]);
            }
          };
        }
      };
    },
    countDocuments: (filter: unknown) => {
      calls.push(["countDocuments", filter]);
      return result(21);
    },
    findById: (id: string) => {
      calls.push(["findById", id]);
      return result({ id, name: "Pizza" });
    },
    findByIdAndUpdate: (id: string, data: Partial<Item>, options: unknown) => {
      calls.push(["findByIdAndUpdate", id, data, options]);
      return result({ id, ...data });
    },
    findByIdAndDelete: (id: string) => {
      calls.push(["findByIdAndDelete", id]);
      return result({ id, name: "Pizza" });
    }
  } as unknown as Model<Item>;

  return { model, calls };
}

test("BaseService delegates CRUD operations to the model", async () => {
  const { model, calls } = createModel();
  const service = new TestService(model);

  assert.deepEqual(await service.createOne({ name: "Pizza" }), {
    id: "1",
    name: "Pizza"
  });
  assert.deepEqual(
    await service.findAll({
      filter: { name: "Pizza" },
      page: 2,
      limit: 10
    }),
    {
      data: [{ id: "1", name: "Pizza" }],
      pagination: {
        page: 2,
        limit: 10,
        total: 21,
        totalPages: 3
      }
    }
  );
  assert.deepEqual(await service.findOne("1"), { id: "1", name: "Pizza" });
  assert.deepEqual(await service.update("1", { name: "Pasta" }), {
    id: "1",
    name: "Pasta"
  });
  assert.deepEqual(await service.delete("1"), { id: "1", name: "Pizza" });

  assert.deepEqual(calls.slice(0, 4), [
    ["find", { name: "Pizza" }],
    ["skip", 10],
    ["limit", 10],
    ["countDocuments", { name: "Pizza" }]
  ]);
  assert.deepEqual(
    calls.slice(4).map(([name, id]) => [name, id]),
    [
      ["findById", "1"],
      ["findByIdAndUpdate", "1"],
      ["findByIdAndDelete", "1"]
    ]
  );
});
