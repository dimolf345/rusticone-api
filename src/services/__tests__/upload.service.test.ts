import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ICloudinaryUploader,
  IUploadSessionStore
} from "../../interfaces/upload/index.js";
import { UploadService } from "../upload.service.js";

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
