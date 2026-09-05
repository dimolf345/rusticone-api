import mongoose from "mongoose";

// Import the model barrel for its side effects so every schema is registered
// before we synchronize indexes below.
import "../models/index.js";

const defaultMongoUri = "mongodb://localhost:27017/rusticone-dev";
const maxRetriesEnv = Number.parseInt(process.env.MONGODB_MAX_RETRIES ?? "", 10);
const maxRetries = Number.isFinite(maxRetriesEnv) && maxRetriesEnv > 0 ? maxRetriesEnv : 5;
const retryDelayMsEnv = Number.parseInt(process.env.MONGODB_RETRY_DELAY_MS ?? "", 10);
const retryDelayMs =
  Number.isFinite(retryDelayMsEnv) && retryDelayMsEnv >= 0 ? retryDelayMsEnv : 2000;

export async function connectDatabase(): Promise<void> {
  const mongoUri = process.env.MONGO_INITDB_DATABASE ?? defaultMongoUri;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000
      });
      console.log("Connected to MongoDB");
      await synchronizeIndexes();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`MongoDB connection attempt ${attempt} failed: ${message}`);

      if (attempt === maxRetries) {
        throw new Error(
          `Unable to connect to MongoDB after ${maxRetries} attempts`,
          {
            cause: error
          }
        );
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

/**
 * Aligns the database indexes with the current schemas. This drops obsolete
 * indexes left behind by past schema changes (e.g. the renamed session
 * `refreshToken` unique index) that would otherwise reject valid inserts.
 * Failures are logged but never block startup.
 */
async function synchronizeIndexes(): Promise<void> {
  if (process.env.DB_SYNC_INDEXES === "false") {
    return;
  }

  for (const modelName of mongoose.modelNames()) {
    try {
      await mongoose.model(modelName).syncIndexes();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Index synchronization failed for ${modelName}: ${message}`);
    }
  }
}
