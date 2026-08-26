import assert from "node:assert/strict";
import { test } from "node:test";

import { AUTH_PROVIDERS, UserModel } from "./user.js";

test("User model accepts a plus-address email", async () => {
  const user = new UserModel({
    email: "customer+quotes@example.com",
    password: "secure-password",
    name: "Customer",
    authProvider: AUTH_PROVIDERS.Local,
    authProviderUserId: "customer+quotes@example.com"
  });

  await user.validate();
  assert.equal(user.email, "customer+quotes@example.com");
});
