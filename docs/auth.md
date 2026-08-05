# Auth

## Google sign-up / login flow

The backend exposes `POST /auth/google` for the optional Google authentication flow.

### How it works

1. The client obtains a Google ID token after the user signs in with Google.
2. The client sends that token to `POST /auth/google` as JSON:

```json
{
  "idToken": "<google-id-token>"
}
```

3. The server verifies the token with Google using `GOOGLE_CLIENT_ID`.
4. The server extracts the Google profile data:
   - Google user id
   - email
   - name
   - avatar URL
   - email verified flag
5. The server looks for an existing user by either:
   - Google provider id, or
   - email
6. If no user exists, it creates one with:
   - `authProvider = "google"`
   - `authProviderUserId = <google user id>`
   - default `role = "customer"`
   - profile data from Google
7. If a user already exists, it updates the stored Google-linked profile data and refreshes `lastLoginAt`.
8. The server returns:
   - an application JWT access token
   - the user payload
   - whether this was a new user or a login

### Response behavior

- `201 Created` means the user was created during this request.
- `200 OK` means the user already existed and logged in.
- `400 Bad Request` means the token was missing or invalid.
- `500 Internal Server Error` means the server could not verify Google sign-in, usually because `GOOGLE_CLIENT_ID` is missing.

### Environment variables

- `GOOGLE_CLIENT_ID` is required for token verification.
- `JWT_SECRET` is used to sign the application access token.
- `JWT_EXPIRES_IN` controls the JWT lifetime and defaults to `7d`.

### Notes

This flow is intentionally optional. It does not replace user CRUD; it creates the authenticated user identity first, then the rest of the API can rely on the returned application token.