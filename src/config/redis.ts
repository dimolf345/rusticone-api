import { createClient, type RedisClientType } from "redis";

import { logger } from "../logger/index.js";

const defaultRedisUrl = "redis://localhost:6379";

let client: RedisClientType | undefined;
let connecting: Promise<RedisClientType> | undefined;

/**
 * Returns a lazily-initialized, connected Redis client.
 *
 * The connection is only opened on first use so code paths that never touch
 * Redis (for example creating a product without an upload session) do not
 * require a running Redis instance.
 */
export async function getRedisClient(): Promise<RedisClientType> {
  if (client?.isReady) {
    return client;
  }

  if (connecting !== undefined) {
    return connecting;
  }

  const redisUrl = process.env.REDIS_URL ?? defaultRedisUrl;
  const instance: RedisClientType = createClient({ url: redisUrl });

  instance.on("error", (error) => logger.error({ err: error }, "Redis client error"));
  instance.on("connect", () => logger.info("Connected to Redis"));

  connecting = instance
    .connect()
    .then(() => {
      client = instance;
      return instance;
    })
    .finally(() => {
      connecting = undefined;
    });

  return connecting;
}

/** Closes the Redis connection if one is open. Intended for graceful shutdown and tests. */
export async function disconnectRedis(): Promise<void> {
  if (client?.isOpen) {
    await client.quit();
  }
  client = undefined;
}
