import "dotenv/config";

import { Server } from "http";

import mongoose from "mongoose";

import { app } from "./app.js";
import { connectDatabase } from "./config/database.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

async function startServer(): Promise<void> {
  await connectDatabase();

  const server: Server = app.listen(port, host, () => {
    console.log(`Server listening on port ${port}`);
  });

  // Handle graceful shutdown on SIGTERM/SIGINT
  const shutdownHandler = async (signal: string) => {
    console.log(`Received ${signal}, starting graceful shutdown...`);

    server.close(async (error) => {
      if (error) {
        console.error("Error closing server:", error);
        process.exitCode = 1;
      }

      try {
        await mongoose.disconnect();
        console.log("Mongoose disconnected successfully");
        process.exit(process.exitCode || 0);
      } catch (disconnectError) {
        const message =
          disconnectError instanceof Error
            ? disconnectError.message
            : String(disconnectError);
        console.error("Error disconnecting from MongoDB:", message);
        process.exitCode = 1;
        process.exit(1);
      }
    });

    // Force shutdown after 10 seconds if graceful shutdown times out
    setTimeout(() => {
      console.error("Graceful shutdown timeout, forcing exit");
      process.exit(1);
    }, 10000);
  };

  process.once("SIGTERM", () => shutdownHandler("SIGTERM"));
  process.once("SIGINT", () => shutdownHandler("SIGINT"));
}

startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Server startup failed: ${message}`);
  process.exitCode = 1;
});
