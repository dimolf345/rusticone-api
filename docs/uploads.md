# Product Image Pre-Upload (Cloudinary + Redis)

Product images are uploaded in two stages so the client can upload files before
the product form is submitted:

1. **Pre-upload** — `POST /api/uploads/temp` streams image files to Cloudinary
   (or writes them to disk in non-production) and caches the resulting URLs in
   Redis under a short-lived `uploadSessionId` (1 hour TTL).
2. **Product creation** — `POST /api/products` accepts the `uploadSessionId`,
   moves the cached URLs into `productImages`, persists the product, and deletes
   the Redis session so the URLs can only be consumed once.

`POST /api/uploads/temp` and `POST /api/products` are admin only
(`authMiddleware` + `isAdminMiddleware`).

In development / non-production environments, locally uploaded images are served
via `GET /api/uploads/temp-catering/:filename` (protected by `authMiddleware`).

## Endpoints

### POST /api/uploads/temp

Multipart request that accepts up to 5 image files under the `images` field
(5 MB each, `image/*` only).

Request (`multipart/form-data`):

| Field    | Type   | Notes                          |
| -------- | ------ | ------------------------------ |
| `images` | file[] | 1–5 image files, 5 MB per file |

Response `200 OK`:

```json
{
  "message": "Images pre-uploaded successfully",
  "uploadSessionId": "3f1c...uuid",
  "imageUrls": ["https://res.cloudinary.com/.../image1.jpg"]
}
```

Errors:

| Status | Cause                                            |
| ------ | ------------------------------------------------ |
| 400    | No files provided or a non-image file was sent   |
| 401    | Missing/invalid access token                     |
| 403    | Authenticated user is not an admin               |
| 503    | Redis (upload storage) is unreachable            |

### GET /api/uploads/temp-catering/:filename (Development Only)

Streams a locally stored image from `uploads/temp-catering/<filename>`. This
endpoint is only registered outside of production (`NODE_ENV !== "production"`)
and requires a valid access token (`authMiddleware`). Sets
`Cross-Origin-Resource-Policy: cross-origin` so the frontend can display the
image across origins in development.

Errors:

| Status | Cause                                                       |
| ------ | ----------------------------------------------------------- |
| 400    | Invalid filename                                            |
| 401    | Missing/invalid access token                                |
| 404    | File does not exist or endpoint is called in `production`   |

### POST /api/products

Standard product creation with an optional `uploadSessionId`:

```json
{
  "name": "Rustico misto",
  "basePrice": 12.5,
  "categories": ["Rustici"],
  "uploadSessionId": "3f1c...uuid"
}
```

- When `uploadSessionId` is present and valid, the cached image URLs are written
  to `productImages` and the session is removed from Redis.
- When it is missing, the product is created with whatever `productImages` the
  payload already contains (empty by default).
- When it is invalid or expired, the request fails with `400 Bad Request`
  (`Invalid or expired uploadSessionId`).

## Configuration

Environment variables:

| Variable                | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name (production)         |
| `CLOUDINARY_API_KEY`    | Cloudinary API key (production)                    |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret (production)                 |
| `REDIS_URL`             | Redis connection URL (default `redis://localhost:6379`) |
| `UPLOAD_LOCAL_DIR`      | Local upload folder for non-production (default `uploads`) |
| `PUBLIC_BASE_URL`       | Base URL used to build local image URLs (default `http://localhost:3000`) |

### Image storage by environment

The uploader is selected by `NODE_ENV` (`src/config/image-uploader.ts`):

- **Production** streams images to the Cloudinary `temp-catering` folder and
  returns `secure_url` CDN links.
- **Development / test** writes images to a local folder
  (`UPLOAD_LOCAL_DIR`, default `./uploads`) under a `temp-catering`
  subfolder and returns URLs served through the upload router
  (for example `http://localhost:3000/api/uploads/temp-catering/<uuid>.png`). No
  Cloudinary credentials are required for local development.

- Redis keys use the `temp_images:<uploadSessionId>` pattern with a 3600-second TTL.
- The Redis client connects lazily on first use, so product creation without an
  `uploadSessionId` never requires a running Redis instance.

## Architecture

| Concern                | Location                                          |
| ---------------------- | ------------------------------------------------- |
| Uploader selection     | `src/config/image-uploader.ts`                    |
| Cloudinary client      | `src/config/cloudinary.ts`                        |
| Local folder storage   | `src/config/local-storage.ts`                     |
| Redis client           | `src/config/redis.ts`                             |
| Multer middleware      | `src/middleware/upload.middleware.ts`             |
| Upload service         | `src/services/upload.service.ts`                  |
| Redis session store    | `src/services/upload-session-store.service.ts`    |
| Upload controller      | `src/controllers/upload.controller.ts`            |
| Upload route           | `src/routes/upload.ts`                            |
| Product integration    | `src/controllers/products.controller.ts`          |

The image uploader and the upload service are injectable
(`IUploadRouterDependencies`, `ICloudinaryUploader`) following the same
dependency-injection pattern used by the auth router, which keeps tests
hermetic (no real Cloudinary or disk writes unless testing local storage).

## Maintenance

- **Orphaned images:** Cloudinary retains uploaded files even when a Redis
  session expires without a product being created. Schedule a periodic cleanup
  (Cloudinary folder lifecycle or a cron job) targeting `temp-catering` assets
  older than 24 hours. Not implemented here — tracked as a follow-up.
- **Redis failover:** All Redis operations are wrapped in `try/catch`; failures
  are logged and surfaced as `503 Service Unavailable`.

## Testing

Tests run against the test Mongo and Redis containers defined in
`docker-compose.test.yml`:

```bash
npm test
```

- `src/services/__tests__/upload.service.test.ts` — unit tests for uploading
  buffers with a fake Cloudinary uploader / in-memory session store and
  resolving local temporary image paths.
- `src/routes/__tests__/upload.test.ts` — integration tests hitting
  `POST /api/uploads/temp` and `GET /api/uploads/temp-catering/:filename`
  against the test database and Redis (covering admin/authenticated access,
  missing files, and production environment gating).
- `src/routes/__tests__/product.test.ts` — covers product creation with a valid
  `uploadSessionId` (images attached, key deleted), an expired session (`400`),
  and no session (`201`).
