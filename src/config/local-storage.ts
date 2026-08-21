import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { logger } from "../logger/index.js";

/** Root folder (relative to the process cwd) where dev uploads are written. */
export const LOCAL_UPLOAD_DIR = process.env.UPLOAD_LOCAL_DIR ?? "uploads";

/** Public route prefix under which the local upload folder is served. */
export const LOCAL_UPLOAD_ROUTE = "/uploads";

function getPublicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
}

/** Guesses an image file extension from the buffer's magic bytes. */
function detectImageExtension(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return "img";
}

/**
 * Persists an image buffer to the local upload folder and returns a URL that
 * resolves through the statically served `/uploads` route. Used in development
 * as a drop-in replacement for the Cloudinary uploader.
 */
export async function uploadBufferToLocal(
  fileBuffer: Buffer,
  folder = "catering-products"
): Promise<{ secure_url: string }> {
  const extension = detectImageExtension(fileBuffer);
  const fileName = `${randomUUID()}.${extension}`;
  const targetDir = path.resolve(LOCAL_UPLOAD_DIR, folder);

  await mkdir(targetDir, { recursive: true });
  await writeFile(path.join(targetDir, fileName), fileBuffer);

  const secureUrl = `${getPublicBaseUrl()}${LOCAL_UPLOAD_ROUTE}/${folder}/${fileName}`;
  logger.info({ secureUrl }, "Stored image in local upload folder");

  return { secure_url: secureUrl };
}
