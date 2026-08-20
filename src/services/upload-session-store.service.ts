import { randomUUID } from "node:crypto";

import { getRedisClient } from "../config/redis.js";
import { ServiceUnavailableError } from "../errors/index.js";
import type { IUploadSessionStore } from "../interfaces/upload/index.js";
import { logger } from "../logger/index.js";

const KEY_PREFIX = "temp_images:";
const TTL_SECONDS = 3600; // Cached image URLs expire after 1 hour.

/** Redis-backed store for pre-uploaded image URLs, keyed by a short-lived session id. */
export class RedisUploadSessionStore implements IUploadSessionStore {
  async save(imageUrls: string[]): Promise<string> {
    const uploadSessionId = randomUUID();

    try {
      const client = await getRedisClient();
      await client.set(`${KEY_PREFIX}${uploadSessionId}`, JSON.stringify(imageUrls), {
        EX: TTL_SECONDS
      });
    } catch (error) {
      logger.error({ err: error }, "Failed to store upload session in Redis");
      throw new ServiceUnavailableError("Image upload storage is currently unavailable");
    }

    return uploadSessionId;
  }

  async get(uploadSessionId: string): Promise<string[] | null> {
    let raw: string | null;

    try {
      const client = await getRedisClient();
      raw = await client.get(`${KEY_PREFIX}${uploadSessionId}`);
    } catch (error) {
      logger.error({ err: error }, "Failed to read upload session from Redis");
      throw new ServiceUnavailableError("Image upload storage is currently unavailable");
    }

    if (raw === null) {
      return null;
    }

    return JSON.parse(raw) as string[];
  }

  async delete(uploadSessionId: string): Promise<void> {
    try {
      const client = await getRedisClient();
      await client.del(`${KEY_PREFIX}${uploadSessionId}`);
    } catch (error) {
      logger.error({ err: error }, "Failed to delete upload session from Redis");
      throw new ServiceUnavailableError("Image upload storage is currently unavailable");
    }
  }
}
