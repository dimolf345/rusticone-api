import assert from "node:assert/strict";
import { test } from "node:test";
import type { Model } from "mongoose";

import type { StoredUser } from "../interfaces/user/index.js";
import { UserService } from "./user.service.js";

test("UserService uses the supplied user model", async () => {
  const user = { id: "user-1", email: "user@example.com" };
  const model = {
    findById: (id: string) => ({
      exec: async () => ({ ...user, id })
    })
  } as unknown as Model<StoredUser>;
  const service = new UserService(model);

  assert.deepEqual(await service.findOne("user-1"), user);
});
