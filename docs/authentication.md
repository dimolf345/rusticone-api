# Authentication and Sessions

The API supports local email and password authentication with short-lived JWT access tokens and persistent refresh-token sessions stored in MongoDB.

## Configuration

Set the following environment variables before starting the API:

```env
JWT_ACCESS_SECRET=replace-with-a-secure-access-token-secret
JWT_REFRESH_SECRET=replace-with-a-secure-refresh-token-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

Both secrets are required. Use separate, securely generated values in deployed environments. The expiration variables are optional and default to `15m` for access tokens and `7d` for refresh tokens.

Each refresh-token session stores the expiration timestamp from the token's signed `exp` claim. A MongoDB TTL index removes the session at that timestamp, so changing `JWT_REFRESH_EXPIRES_IN` keeps token and session expiration synchronized.

## Authentication Flow

1. Register or log in to receive an access token and refresh token.
2. Send the access token as `Authorization: Bearer <accessToken>` when calling protected endpoints.
3. Exchange the refresh token for a new access token when the access token expires.
4. Log out with the refresh token to remove that session.

Each registration or login creates a separate session, allowing a user to remain authenticated on multiple devices. Sessions record the request IP address and user agent. MongoDB automatically removes expired sessions through a TTL index.

## Endpoints

All authentication endpoints use the `/api/auth` prefix. Request and response bodies use JSON unless otherwise noted.

### Register

`POST /api/auth/register`

Creates a local user, hashes the password with bcrypt, creates a session, and returns both token types.

Request:

```json
{
  "email": "customer@example.com",
  "password": "secure-password",
  "name": "Customer Example"
}
```

`email` must be valid, `password` must contain at least eight characters, and `name` is optional.

Success response: `201 Created`

```json
{
  "accessToken": "<access-token>",
  "refreshToken": "<refresh-token>",
  "user": {
    "id": "<user-id>",
    "email": "customer@example.com",
    "name": "Customer Example",
    "role": "customer",
    "authProvider": "local",
    "createdAt": "2026-08-05T12:00:00.000Z",
    "updatedAt": "2026-08-05T12:00:00.000Z"
  }
}
```

Errors:

- `400 Bad Request`: Invalid email or password.
- `409 Conflict`: The email is already registered.
- `500 Internal Server Error`: The user or session could not be created.

### Login

`POST /api/auth/login`

Validates local credentials, updates the user's last login time, creates a new session, and returns both token types.

Request:

```json
{
  "email": "customer@example.com",
  "password": "secure-password"
}
```

Success response: `200 OK`

The response has the same shape as registration and includes `lastLoginAt` in the user profile.

Errors:

- `400 Bad Request`: Email or password is missing.
- `401 Unauthorized`: The credentials are invalid or the account does not use local authentication.
- `500 Internal Server Error`: Login or session creation failed.

### Refresh Access Token

`POST /api/auth/refresh`

Validates the refresh JWT and confirms that its session still exists before issuing a new access token. Refresh tokens are not rotated by this endpoint.

Request:

```json
{
  "refreshToken": "<refresh-token>"
}
```

Success response: `200 OK`

```json
{
  "accessToken": "<new-access-token>"
}
```

Errors:

- `400 Bad Request`: The refresh token is missing.
- `401 Unauthorized`: The token is invalid, expired, logged out, or belongs to a deleted user.

### Logout

`POST /api/auth/logout`

Deletes the session associated with the supplied refresh token. Existing access tokens remain valid until they expire.

Request:

```json
{
  "refreshToken": "<refresh-token>"
}
```

Success response: `204 No Content`

Logout is idempotent: a well-formed request receives `204 No Content` even when the session has already been removed.

### Current User

`GET /api/auth/me`

Returns the profile associated with a valid access token.

Request header:

```text
Authorization: Bearer <access-token>
```

Success response: `200 OK`

```json
{
  "user": {
    "id": "<user-id>",
    "email": "customer@example.com",
    "name": "Customer Example",
    "role": "customer",
    "authProvider": "local",
    "lastLoginAt": "2026-08-05T12:00:00.000Z",
    "createdAt": "2026-08-05T11:00:00.000Z",
    "updatedAt": "2026-08-05T12:00:00.000Z"
  }
}
```

Errors:

- `401 Unauthorized`: The access token is missing, invalid, or expired.
- `404 Not Found`: The authenticated user no longer exists.

## Security Behavior

- Passwords are hashed with bcrypt using a cost factor of 12 and are excluded from queries by default.
- Access and refresh tokens use separate secrets and expiration settings.
- Refresh tokens are checked against persistent sessions, enabling per-device logout.
- Access tokens contain the user ID and email. Refresh tokens contain the user ID and a unique JWT ID.
- API responses never include password hashes.

Refresh tokens are credentials and must be stored securely by clients. Do not log tokens or include them in URLs.

## OpenAPI

The machine-readable OpenAPI 3.0 document is available at:

```text
GET /openapi.json
```

It includes all authentication endpoints and the bearer-token security scheme used by `/api/auth/me`.

## Tests

Run the database-backed integration tests in Docker:

```sh
npm test
```

The test suite starts a dedicated MongoDB service and exercises registration, password hashing, login, protected profile access, token refresh, logout, duplicate registration, invalid tokens, and OpenAPI coverage through real HTTP requests.

When a test MongoDB instance is already available, run:

```sh
MONGODB_URI=mongodb://127.0.0.1:27017/rusticone-test npm run test:local
```
