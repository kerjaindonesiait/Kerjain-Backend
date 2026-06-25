# Authentication

KerjaIn uses JWT-based authentication with HttpOnly cookies. The frontend receives user profile data in JSON, but it does not receive or store JWT strings directly.

## Cookie Model

The backend sets two cookies after a successful login or OAuth callback:

| Cookie | Purpose | Lifetime | JavaScript access |
| --- | --- | --- | --- |
| `kerjain_access` | Short-lived access JWT | 15 minutes | No, HttpOnly |
| `kerjain_refresh` | Long-lived refresh JWT | 30 days | No, HttpOnly |

Cookie attributes:

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- `Secure=true` in production

Frontend requests that need authentication must include credentials:

```ts
fetch("https://api.kerjaindonesia.com/api/auth/me", {
  credentials: "include",
});
```

## Required Environment Variables

Minimum email/password auth:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
FRONTEND_URL=https://kerjaindonesia.com
COOKIE_SECURE=true
```

Local development:

```env
FRONTEND_URL=http://localhost:5173
COOKIE_SECURE=false
```

Google OAuth:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://api.kerjaindonesia.com/auth/google/callback
```

For local Google OAuth, use:

```env
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

The same redirect URI must be registered in Google Cloud Console.

## Email and Password Flow

### Register

```http
POST /api/auth/register
```

Request:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "User Name",
  "role": "user"
}
```

Behavior:

- Creates a user with `email_verified=false`.
- Sends an email verification link.
- Does not create a login session.
- Does not set auth cookies.
- Does not return JWTs.

Response:

```json
{
  "ok": true,
  "user": {
    "id": "...",
    "email": "user@example.com",
    "fullName": "User Name",
    "role": "user",
    "avatarUrl": null,
    "emailVerified": false,
    "phone": null,
    "createdAt": "..."
  }
}
```

### Verify Email

```http
POST /api/auth/verify-email
```

Request:

```json
{
  "token": "verification-token"
}
```

Response:

```json
{
  "ok": true,
  "user": {
    "emailVerified": true
  }
}
```

### Login

```http
POST /api/auth/login
```

Request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Behavior:

- Rejects invalid credentials with `401`.
- Rejects unverified email users with `403`.
- Sets `kerjain_access` and `kerjain_refresh` cookies.
- Returns user data only.
- Does not return JWTs.

Response:

```json
{
  "user": {
    "id": "...",
    "email": "user@example.com",
    "role": "user",
    "emailVerified": true
  }
}
```

### Current User

```http
GET /api/auth/me
```

Requires the `kerjain_access` cookie.

Response:

```json
{
  "user": {
    "id": "...",
    "email": "user@example.com",
    "role": "user"
  }
}
```

### Refresh

```http
POST /api/auth/refresh
```

Requires the `kerjain_refresh` cookie.

Behavior:

- Verifies the refresh JWT.
- Checks the hashed refresh token in `refresh_tokens`.
- Sets a new `kerjain_access` cookie.
- Does not rotate the refresh token.
- Returns user data only.

Response:

```json
{
  "user": {
    "id": "...",
    "email": "user@example.com",
    "role": "user"
  }
}
```

### Logout

```http
POST /api/auth/logout
```

Behavior:

- Reads the refresh token cookie if present.
- Deletes the matching hashed token from `refresh_tokens`.
- Clears `kerjain_access` and `kerjain_refresh`.

Response:

```json
{
  "ok": true
}
```

## Google OAuth Flow

Google OAuth uses the same HttpOnly cookie session model.

Start OAuth with browser navigation, not `fetch`:

```http
GET /auth/google?role=user
```

Technician signup:

```http
GET /auth/google?role=technician
```

Optional safe relative redirect target:

```http
GET /auth/google?role=technician&next=/daftar-tukang?resume=1
```

Backend behavior:

1. Redirects to Google with signed OAuth `state`.
2. Receives Google callback at `/auth/google/callback`.
3. Finds or creates the user.
4. Sets `kerjain_access` and `kerjain_refresh` cookies.
5. Redirects to the frontend:

```text
https://kerjaindonesia.com/auth/callback?oauth=success
```

If `next` is valid and relative, it is included:

```text
https://kerjaindonesia.com/auth/callback?oauth=success&next=/daftar-tukang?resume=1
```

JWTs must never appear in OAuth redirect URLs.

## Disabled OAuth Providers

Facebook OAuth is intentionally disabled for now:

```http
GET /auth/facebook
```

Response:

```json
{
  "error": "Facebook OAuth not enabled"
}
```

The Facebook callback redirects to:

```text
/masuk?error=oauth_unavailable
```

## Postman Verification Checklist

Email/password auth:

1. `POST /api/auth/register`
2. Confirm no auth cookies are set.
3. `POST /api/auth/login` before verification should return `403`.
4. `POST /api/auth/verify-email`
5. `POST /api/auth/login`
6. Confirm Postman shows two cookies: `kerjain_access`, `kerjain_refresh`.
7. `GET /api/auth/me` should return the user.
8. `POST /api/auth/refresh` should return the user and refresh `kerjain_access`.
9. `POST /api/auth/logout` should clear cookies.
10. `GET /api/auth/me` after logout should return `401`.

Google OAuth:

1. Open `/auth/google?role=user` in a browser.
2. Complete Google login.
3. Confirm final URL does not contain `access_token` or `refresh_token`.
4. Confirm browser has `kerjain_access` and `kerjain_refresh` cookies for the backend domain.
5. Call `/api/auth/me` with credentials included.
