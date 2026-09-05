import type { Logger } from "pino";

import { logger as defaultLogger } from "../logger/index.js";

/** Signals whose corresponding error escaped every request-scoped handler. */
export type FatalErrorOrigin = "uncaughtException" | "unhandledRejection";

export interface IProcessErrorHandlerOptions {
  /** Logger used to record the fatal error. Defaults to the app logger. */
  logger?: Logger;
  /**
   * Best-effort cleanup (close server, disconnect MongoDB/Redis, ...) run
   * before the process exits. Failures are logged but never rethrown.
   */
  shutdown?: () => Promise<void> | void;
  /** Terminates the process. Injectable so tests can assert the exit code. */
  exit?: (code: number) => void;
  /** Hard limit for the graceful shutdown before the process is forced to exit. */
  shutdownTimeoutMs?: number;
}

export interface IProcessErrorHandlers {
  uncaughtExceptionHandler: (error: unknown) => void;
  unhandledRejectionHandler: (reason: unknown) => void;
}

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Builds the `uncaughtException` / `unhandledRejection` listeners without
 * registering them, so their behavior can be unit-tested in isolation.
 *
 * Both listeners funnel into a single fatal path: log the serialized error at
 * `fatal`, attempt a bounded graceful shutdown, then exit with code 1. A
 * process that has reached this state is in an undefined condition, so exiting
 * is the only safe option (per Node.js guidance for `uncaughtException`).
 */
export function createProcessErrorHandlers(
  options: IProcessErrorHandlerOptions = {}
): IProcessErrorHandlers {
  const log = options.logger ?? defaultLogger;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const shutdownTimeoutMs =
    options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;

  let handlingFatalError = false;

  const handleFatalError = async (
    error: unknown,
    origin: FatalErrorOrigin
  ): Promise<void> => {
    // Guard against re-entrancy: a failing shutdown must not restart the flow.
    if (handlingFatalError) {
      return;
    }
    handlingFatalError = true;

    log.fatal(
      { err: error, origin },
      "Unhandled error escaped the application; shutting down"
    );

    if (options.shutdown) {
      try {
        await Promise.race([
          Promise.resolve(options.shutdown()),
          new Promise<void>((resolve) =>
            setTimeout(resolve, shutdownTimeoutMs).unref?.()
          )
        ]);
      } catch (shutdownError) {
        log.error(
          { err: shutdownError },
          "Graceful shutdown failed after fatal error"
        );
      }
    }

    exit(1);
  };

  return {
    uncaughtExceptionHandler: (error: unknown) => {
      void handleFatalError(error, "uncaughtException");
    },
    unhandledRejectionHandler: (reason: unknown) => {
      void handleFatalError(reason, "unhandledRejection");
    }
  };
}

/**
 * Registers the process-level fatal error listeners. This is the outermost
 * safety net: any error that is never handled by a request (for example a
 * rejected Redis promise outside the request lifecycle) is logged with a
 * meaningful message instead of silently killing the process.
 */
export function registerProcessErrorHandlers(
  options: IProcessErrorHandlerOptions = {}
): IProcessErrorHandlers {
  const handlers = createProcessErrorHandlers(options);

  process.on("uncaughtException", handlers.uncaughtExceptionHandler);
  process.on("unhandledRejection", handlers.unhandledRejectionHandler);

  return handlers;
}
