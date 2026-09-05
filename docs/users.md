# Users

The user resource is exposed under `/api/users` and reuses the generic CRUD
behavior described in [base-crud.md](./base-crud.md). Every route requires a
valid access token (`authMiddleware`).

## Document identifiers

MongoDB documents are serialized with the `_id` field renamed to `id`. API
responses contain `id` as a string and do not expose `_id`. This shared
serialization behavior applies to users, products, addons, quotes, and
sessions, including user responses from authentication endpoints.

## Route authorization

| Method & path         | Who can call it                                  |
| --------------------- | ------------------------------------------------ |
| `POST /api/users`     | Admin only (`isAdminMiddleware`)                 |
| `GET /api/users`      | Admin only (`isAdminMiddleware`)                 |
| `GET /api/users/:id`  | Admin only (`isAdminMiddleware`)                 |
| `PATCH /api/users/:id`| Admin (any user) or the customer editing itself  |
| `DELETE /api/users/:id`| Admin only (`isAdminMiddleware`)                |

## PATCH authorization rules

`PATCH /api/users/:id` is available to both admins and customers, but the
`UserController.update` handler enforces additional rules based on the
authenticated user's role:

- **Admin**: can update any user, including changing another user's `role`.
- **Customer**:
  - May only update their own record. When the `:id` in the path does not
    match the authenticated user's id, the request is rejected with
    `403 Forbidden`.
  - May not change their `role`. When the payload contains a `role` that
    differs from their current role, the request is rejected with
    `401 Unauthorized`. Sending the same `role` value is allowed.

Both rejection cases are logged at `warn` level with the requesting user id and
the relevant context.

### Response behavior

- `200 OK` with the updated user when the update is authorized and the user
  exists.
- `403 Forbidden` when a customer targets another user.
- `401 Unauthorized` when a customer attempts to change their role.
- `404 Not Found` when the target user does not exist.

## Testing

Controller-level authorization is covered by unit tests in
`src/controllers/user.controller.test.ts`, which exercise the update
handler with a mocked service for each admin/customer scenario above.
