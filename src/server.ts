import "dotenv/config";

import { Server } from "node:http";

import mongoose from "mongoose";

import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { verifyMailer } from "./config/mailer.js";
import { disconnectRedis } from "./config/redis.js";
import { logger } from "./logger/index.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

async function startServer(): Promise<void> {
  await connectDatabase();

  // Verify SMTP health at boot; a mail outage must not block server startup.
  await verifyMailer();

  const server: Server = app.listen(port, host, () => {
    logger.info({ host, port }, "Server listening");
  });

  // Handle graceful shutdown on SIGTERM/SIGINT
  const shutdownHandler = async (signal: string) => {
    logger.info({ signal }, "Starting graceful shutdown");

    server.close(async (error) => {
      if (error) {
        logger.error({ err: error }, "Error closing server");
        process.exitCode = 1;
      }

      try {
        await mongoose.disconnect();
        logger.info("Mongoose disconnected successfully");
        await disconnectRedis();
        process.exit(process.exitCode || 0);
      } catch (disconnectError) {
        logger.error(
          { err: disconnectError },
          "Error disconnecting from MongoDB"
        );
        process.exitCode = 1;
        process.exit(1);
      }
    });

    // Force shutdown after 10 seconds if graceful shutdown times out
    setTimeout(() => {
      logger.error("Graceful shutdown timeout, forcing exit");
      process.exit(1);
    }, 10000);
  };

  process.once("SIGTERM", () => shutdownHandler("SIGTERM"));
  process.once("SIGINT", () => shutdownHandler("SIGINT"));
}

startServer().catch((error: unknown) => {
  logger.error({ err: error }, "Server startup failed");
  process.exitCode = 1;
});
