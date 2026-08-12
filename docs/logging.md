# Logging

The API uses Pino for centralized structured logging. HTTP requests, server lifecycle events, and application logs are sent to both the console and rotating JSON log files.

## Configuration

Set the minimum log level with `LOG_LEVEL`:

```env
LOG_LEVEL=info
```

The default level is `info`.

## Outputs

Every log event is routed to two destinations:

- Console: human-readable `pino-pretty` output outside production and newline-delimited JSON in production.
- Files: JSON logs under `logs/`, rotated daily by `pino-roll`, with at most 14 daily files retained including the active file.

Generated files follow the `pino-roll` naming convention, for example:

```text
logs/app.2026-08-10.1.log
```

The logger creates the directory automatically. The `logs/` directory is excluded from Git.

## HTTP Request Logging

The logging middleware runs before the other Express middleware. It emits an automatic completion log for every request with request details, response details, response time, and a correlation ID.

HTTP response status determines the completion log level:

| Response status | Log level |
| --------------- | --------- |
| `100`–`399`     | `info`    |
| `400`–`499`     | `warn`    |
| `500`–`599`     | `error`   |

## Correlation IDs

Clients may provide an `x-correlation-id` request header. When it is absent or empty, the API generates a UUID. The value is:

- returned in the `x-correlation-id` response header;
- included as `correlationId` in request logs;
- available through the request-scoped Pino logger.

Use `request.log` inside controllers and middleware so application events inherit the request context:

```ts
request.log.info({ userId }, "Loading user profile");
```

Use the central logger for events outside an HTTP request:

```ts
import { logger } from "./logger/index.js";

logger.info({ port }, "Server listening");
```

## Sensitive Data Redaction

The logger replaces matching values with `[REDACTED]` before writing to any transport. The configured paths are:

- `req.headers.authorization`
- `req.headers.cookie`
- `body.password`
- `body.token`
- `*.creditCard`

Do not rely on redaction as a reason to log complete request bodies. Log only the fields required for diagnostics.

## Architecture

- `src/logger/index.ts`: central logger and transport configuration.
- `src/logger/middleware.ts`: Express integration, correlation IDs, and HTTP levels.
- `src/logger/redactor.ts`: shared redaction rules.
- `src/logger/middleware.test.ts`: HTTP-level integration coverage.

The transport configuration is isolated from callers so local files can later be replaced by a cloud aggregation transport without changing application logging calls.

## Tests

Run the focused logging tests with:

```sh
npx tsx --test src/logger/middleware.test.ts
```

The test performs actual HTTP calls and verifies generated and supplied correlation IDs, status-based levels, and sensitive-value redaction.
