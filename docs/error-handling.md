# Error Handling

The API uses a centralized error-handling strategy built around a typed error
hierarchy, a global Express error middleware, and structured Pino logging. This
keeps controllers free of repetitive `try/catch` blocks and guarantees clients
always receive a consistent, safe JSON payload.

## Architecture

- `src/errors/`: the `AppError` base class and HTTP-specific subclasses.
- `src/middleware/errorHandler.ts`: the global Express error handler.
- `src/middleware/notFoundHandler.ts`: catch-all for unmatched routes (JSON 404).
- `src/utils/asyncHandler.ts`: wrapper that forwards async rejections to Express.
- `src/utils/processErrorHandlers.ts`: process-level net for fatal errors.
- `src/logger/`: the Pino logger and request logger (see `docs/logging.md`).

The layers wrap the application from the inside out:

1. **Typed errors** thrown by controllers/services.
2. **`asyncHandler`** forwards rejected promises inside a request to Express.
3. **`notFoundHandler`** turns any unmatched route into a `NotFoundError`.
4. **`errorHandler`** normalizes every error into a safe JSON response.
5. **`processErrorHandlers`** catch anything that still escaped the request
   lifecycle (for example a rejected Redis promise in background work) so the
   process logs a meaningful message and shuts down instead of dying silently.

## Error Classes

`AppError` extends the native `Error` and adds the metadata the handler needs:

| Property        | Type                | Description                                            |
| --------------- | ------------------- | ------------------------------------------------------ |
| `statusCode`    | `number` (def. 500) | HTTP status code returned to the client.               |
| `status`        | `"fail" \| "error"` | `"fail"` for 4xx, `"error"` for 5xx. Derived.          |
| `isOperational` | `boolean` (def. true) | `true` for expected/handled failures.                |

The stack trace is captured with `Error.captureStackTrace(this, this.constructor)`.

The following subclasses set the appropriate status code:

| Class                 | Status | `isOperational` |
| --------------------- | ------ | --------------- |
| `BadRequestError`     | 400    | `true`          |
| `UnauthorizedError`   | 401    | `true`          |
| `ForbiddenError`      | 403    | `true`          |
| `NotFoundError`       | 404    | `true`          |
| `ConflictError`       | 409    | `true`          |
| `InternalServerError` | 500    | `false`         |

Import them from the barrel:

```ts
import { NotFoundError } from "../errors/index.js";

throw new NotFoundError("User not found");
```

## Async Wrapper

Wrap async route handlers with `asyncHandler` so rejected promises are forwarded
to the error middleware automatically:

```ts
import { asyncHandler } from "../utils/asyncHandler.js";
import { NotFoundError } from "../errors/index.js";

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const user = await userService.findOne(request.params.id);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    response.json(user);
  })
);
```

## Global Error Middleware

`errorHandler` is registered after all routes in `src/app.ts`. For every error it:

1. Determines the `statusCode` (from `AppError`, otherwise `500`).
2. Logs before responding, using the request-scoped Pino logger:
   - Operational errors (`isOperational === true`) are logged at `warn`.
   - Unexpected errors (`isOperational === false`) are logged at `error` with the
     serialized `err` object so Pino records the full stack trace.
   - Each log entry includes `reqId` (the correlation ID) and `path`.
3. Sends the standardized client response.

### Client Response

```json
{
  "success": false,
  "status": "fail",
  "message": "Sanitized error message",
  "requestId": "req-12345"
}
```

- `status` is `"fail"` for 4xx and `"error"` for 5xx.
- `requestId` is the correlation ID attached by the request logger.
- The real message is only exposed for operational errors, or in non-production
  environments. Unexpected production errors return the generic
  `"Internal Server Error"` message and **never** expose stack traces.

## Unmatched Routes

`notFoundHandler` is registered in `src/app.ts` after every router but before
`errorHandler`. Any request that matches no route is converted into a
`NotFoundError` (`Cannot <METHOD> <URL>`) so clients receive the same JSON
envelope as every other error instead of Express's default HTML 404.

## Process-Level Safety Net

`registerProcessErrorHandlers` is wired in `src/server.ts` during startup. It
attaches listeners for the two Node.js events that represent truly unhandled
failures:

- `uncaughtException` — a synchronous throw with no surrounding `try/catch`.
- `unhandledRejection` — a rejected promise nobody awaited or `.catch`-ed
  (e.g. a background Redis operation failing when the server cannot reach Redis).

Both funnel into a single fatal path that:

1. Logs the serialized error at `fatal` with an `origin` field identifying the
   triggering event, so the operator finally sees a meaningful message.
2. Runs a bounded, best-effort graceful shutdown (close the HTTP server,
   disconnect MongoDB and Redis). A failing or slow shutdown cannot hang the
   process because it races a timeout.
3. Exits the process with code `1`.

A re-entrancy guard ensures a second fatal event while shutting down does not
restart the flow. The factory `createProcessErrorHandlers` accepts injectable
`logger`, `shutdown`, and `exit` dependencies so the behavior is unit-tested
without terminating the test runner.

## Integration

The strategy is wired through the existing layers:

- **Controllers** (`base.controller.ts`, `user.controller.ts`, `auth.controller.ts`)
  no longer use `try/catch` for flow control. They throw typed errors (e.g.
  `NotFoundError`, `BadRequestError`, `UnauthorizedError`, `ConflictError`) and
  let rejections bubble up.
- **Services** (`auth.service.ts`) throw the same typed errors instead of a
  bespoke `AuthError`.
- **Auth middleware** (`auth.middleware.ts`, `is-admin.middleware.ts`) forward
  `UnauthorizedError` / `ForbiddenError` through `next(err)`.
- **Routes** (`routes/auth.ts`, `routes/user.ts`) wrap every handler with
  `asyncHandler` so async rejections reach the centralized `errorHandler`.

## Tests

Run the focused error-handling tests with:

```sh
npx tsx --test \
  src/errors/AppError.test.ts \
  src/middleware/errorHandler.test.ts \
  src/middleware/notFoundHandler.test.ts \
  src/utils/asyncHandler.test.ts \
  src/utils/processErrorHandlers.test.ts
```

They cover status-code/label derivation, operational vs. unexpected logging
levels, production message sanitization, async rejection forwarding, the JSON
404 for unmatched routes, and the fatal-error path (fatal logging, graceful
shutdown, exit code, and the re-entrancy guard).
