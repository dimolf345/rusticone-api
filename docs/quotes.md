# Quotes

The quote resource is exposed under `/api/quotes` and manages catering quote
requests. Every route requires a valid access token (`authMiddleware`).

Unlike products and users, the quote service and controller are **standalone**
classes that implement `IBaseServiceInterface` / `IBaseControllerInterface`
directly (they do not extend the base classes), because every operation is
customized. Shared pagination logic lives in
[`src/utils/pagination.ts`](../src/utils/pagination.ts).

## Route authorization

| Method & path                    | Who can call it                                           |
| -------------------------------- | -------------------------------------------------------- |
| `POST /api/quotes`               | Any authenticated user (customer or admin)               |
| `GET /api/quotes`                | Any authenticated user (results filtered by role)        |
| `GET /api/quotes/:id`            | Admin, or the customer who owns the quote                |
| `PATCH /api/quotes/:id`          | Admin (always), or the owning customer while not confirmed |
| `POST /api/quotes/:id/comments`  | Admin, or the customer who owns the quote                |
| `PATCH /api/quotes/:id/comments/:commentId` | The comment's original author only            |
| `DELETE /api/quotes/:id`         | Admin only (`isAdminMiddleware`) — soft delete           |

## Price integrity

Product prices are **never** accepted from clients. On create — and on any
update that changes `products` — the service loads each product from the
`Product` collection and snapshots its `basePrice` into
`products[*].priceAtQuote`. Totals are always recomputed server-side:

- `initialPrice = sum(priceAtQuote * quantity) + deliveryFee`
- `finalPrice = max(0, initialPrice - discount)`

If any submitted `productId` does not exist, the request is rejected with
`400 Bad Request`.

## Create — `POST /api/quotes`

- Customers always create quotes for themselves; a `userId` in the body is
  ignored.
- Admins may set `userId` to create a quote on behalf of a customer.
- `status` defaults to `pending` and `validUntil` defaults to 14 days after
  creation.

## List — `GET /api/quotes`

Supports the query parameters `status`, `userId`, `startDate`, `endDate`,
`page`, and `limit`. `userId` and `products.productId` are populated in the
response. Role-based filtering:

- **Customer**: results are restricted to quotes belonging to the authenticated
  user; a `userId` query parameter is ignored.
- **Admin**: all quotes are returned by default, and the standard filters
  (including `userId`) are applied when provided.

`startDate` / `endDate` filter on `deliveryDate` (`$gte` / `$lte`). Soft-deleted
quotes are always excluded.

## Update — `PATCH /api/quotes/:id`

- **Admin**: may edit any quote at any time.
- **Customer**:
  - May only edit their own quote (`403 Forbidden` otherwise).
  - May not edit a quote whose status is `confirmed` (`403 Forbidden`).
  - May only change `requestedPeople`, `dietaryNotes`, `products`,
    `deliveryAddress`, and `deliveryDate`. Sending any other field returns
    `403 Forbidden`.
- Any `status` change must follow the allowed workflow transitions, otherwise
  `400 Bad Request` is returned:

  | From        | Allowed to                          |
  | ----------- | ----------------------------------- |
  | `pending`   | `quoted`, `cancelled`, `rejected`   |
  | `quoted`    | `confirmed`, `rejected`, `cancelled`|
  | `confirmed` | `completed`, `cancelled`            |
  | `rejected`  | — (terminal)                        |
  | `completed` | — (terminal)                        |
  | `cancelled` | — (terminal)                        |

## Comments — `POST /api/quotes/:id/comments`

Appends a message to the quote's `comments` thread.

- Only `message` is read from the body; `senderId` and `senderRole` are derived
  from the authenticated user (admins are recorded with `senderRole: "admin"`,
  customers with `senderRole: "customer"`).
- Customers may only comment on their own quotes (`403 Forbidden` otherwise).
- An empty or missing message returns `400 Bad Request`.

Sample payload:

```json
{ "message": "We confirmed gluten-free options are available." }
```

## Edit comment — `PATCH /api/quotes/:id/comments/:commentId`

Updates the `message` of an existing comment identified by its subdocument id.

- Only the comment's **original author** may edit it; anyone else (including an
  admin who did not write the comment) receives `403 Forbidden`.
- Customers must still own the quote to reach the comment (`403 Forbidden`
  otherwise).
- Only `message` is read from the body; `senderId`, `senderRole`, and
  `createdAt` are never modified.
- An empty or missing message returns `400 Bad Request`.
- An unknown quote or comment id returns `404 Not Found`.

## Delete — `DELETE /api/quotes/:id`

Performs a **logical** delete by stamping `deletedAt`. The document is retained
in the database but excluded from every read path. Admin only.

## Logging

Each handler logs its key step at `info` level (create, list, fetch, update,
comment, delete) using the request-scoped logger. Authorization rejections for
customers editing another user's quote are logged at `warn` level with the quote
id and requesting user id.

## Testing

- Service behavior (price snapshots, total calculation, status-transition rules,
  soft delete) is covered by
  [`src/services/quote.service.test.ts`](../src/services/quote.service.test.ts).
- End-to-end route behavior against the test database (creation with server-side
  pricing, role-based list filtering, ownership checks, confirmed-edit blocking,
  soft delete, and adding comments) is covered by
  [`src/routes/quote.test.ts`](../src/routes/quote.test.ts).
