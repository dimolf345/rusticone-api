import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { uploadBufferToLocal } from "../../config/local-storage.js";
import { BadRequestError, NotFoundError } from "../../errors/index.js";
import type {
  ICloudinaryUploader,
  IUploadSessionStore
} from "../../interfaces/upload/index.js";
import { TEMP_FOLDER, UploadService } from "../upload.service.js";

test("UploadService uploads every buffer and caches the resulting URLs", async () => {
  const uploadedFolders: (string | undefined)[] = [];
  const uploader: ICloudinaryUploader = async (_buffer, folder) => {
    uploadedFolders.push(folder);
    return { secure_url: `https://cdn.example.com/${uploadedFolders.length}.jpg` };
  };

  let savedUrls: string[] = [];
  const store: IUploadSessionStore = {
    save: async (imageUrls) => {
      savedUrls = imageUrls;
      return "session-123";
    },
    get: async () => null,
    delete: async () => undefined
  };

  const service = new UploadService(uploader, store);

  const result = await service.uploadTemp([
    { buffer: Buffer.from("a") },
    { buffer: Buffer.from("b") }
  ]);

  assert.equal(result.uploadSessionId, "session-123");
  assert.deepEqual(result.imageUrls, [
    "https://cdn.example.com/1.jpg",
    "https://cdn.example.com/2.jpg"
  ]);
  assert.deepEqual(savedUrls, result.imageUrls);
  assert.deepEqual(uploadedFolders, ["temp-catering", "temp-catering"]);
});

test("UploadService.getTempImagePath resolves a locally stored temporary image", async () => {
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const { secure_url } = await uploadBufferToLocal(pngBuffer, TEMP_FOLDER);
  const filename = path.basename(new URL(secure_url).pathname);

  const service = new UploadService();

  try {
    const resolvedPath = await service.getTempImagePath(filename);
    assert.ok(resolvedPath.endsWith(path.join(TEMP_FOLDER, filename)));
  } finally {
    const resolvedPath = await service.getTempImagePath(filename).catch(() => null);
    if (resolvedPath) {
      await rm(resolvedPath, { force: true });
    }
  }
});

test("UploadService.getTempImagePath throws NotFoundError for a missing file", async () => {
  const service = new UploadService();

  await assert.rejects(
    () => service.getTempImagePath("non-existent-file.png"),
    (error: unknown) => error instanceof NotFoundError
  );
});

test("UploadService.getTempImagePath throws BadRequestError for path traversal", async () => {
  const service = new UploadService();

  await assert.rejects(
    () => service.getTempImagePath("../package.json"),
    (error: unknown) => error instanceof BadRequestError
  );
});
