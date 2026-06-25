# Admin

Internal admin API for dashboard stats, technician verification, and app settings. Access is gated by email allowlist, not a separate admin role in the database.

## Overview

- Primary route prefix: `/api/admin`
- Source: `src/routes/admin.ts`
- Auth: required; admin routes (except `/me`) require email in `ADMIN_EMAILS`
- Related utils: `src/utils/admin.ts`, `src/utils/settings.ts`, `src/utils/authTokens.ts`

## Required environment variables

```env
ADMIN_EMAILS=admin@kerjaindonesia.com,ops@kerjaindonesia.com
```

Comma-separated, case-insensitive. The signed-in user's email must match one entry.

Also requires global Supabase and auth env vars (see [authentication.md](./authentication.md)).

## Check admin access

### `GET /api/admin/me`

Requires auth cookie. Any signed-in user may call this; response indicates admin status.

Response:

```json
{
  "isAdmin": true
}
```

## Dashboard stats

### `GET /api/admin/stats`

Requires auth + admin email.

Response:

```json
{
  "stats": {
    "pendingVerification": 3,
    "verifiedTechnicians": 12,
    "totalTechnicians": 20,
    "openJobs": 8
  }
}
```

## Technician verification queue

### `GET /api/admin/technicians`

Requires auth + admin.

Query `filter`:

| Value | Meaning |
| --- | --- |
| `pending` (default) | Unverified with KTP + selfie submitted |
| `verified` | Verified technicians |
| `unverified` | All unverified |

Response:

```json
{
  "technicians": [
    {
      "userId": "...",
      "email": "tukang@example.com",
      "fullName": "Andi",
      "phone": "0812...",
      "area": "Jakarta Selatan",
      "verified": false,
      "hasKtpSubmission": true,
      "keahlian": ["pipa"],
      "memberSince": "..."
    }
  ]
}
```

### `PATCH /api/admin/technicians/:userId/verified`

Requires auth + admin.

Request:

```json
{
  "verified": true,
  "sendEmail": true
}
```

Behavior:

- Sets `technician_profiles.verified`.
- When `verified: true` and `sendEmail: true`, sends technician approval email.

Response:

```json
{
  "technician": { "userId": "...", "verified": true },
  "devDashboardLink": "..."
}
```

`devDashboardLink` appears in development when email is logged instead of sent.

## App settings

### `GET /api/admin/settings`

Requires auth + admin.

Response:

```json
{
  "settings": {
    "requireVerifiedToQuote": false,
    "maintenanceMode": false
  }
}
```

### `PATCH /api/admin/settings`

Requires auth + admin.

Request (partial):

```json
{
  "requireVerifiedToQuote": true,
  "maintenanceMode": false
}
```

Persists to `app_settings` table.

## Errors

| Status | Meaning |
| --- | --- |
| 401 | Not signed in |
| 403 | Signed in but email not in `ADMIN_EMAILS` (`Akses admin ditolak`) |
| 404 | Technician profile not found |

## Frontend integration

Admin UI should call `/api/admin/me` first to gate routes client-side, but **always rely on 403 from the API** for security.

```ts
fetch(`${API_URL}/api/admin/stats`, { credentials: "include" });
```

## Verification checklist

1. Sign in as email in `ADMIN_EMAILS`.
2. `GET /api/admin/me` → `{ "isAdmin": true }`.
3. `GET /api/admin/stats` → stats object.
4. `GET /api/admin/technicians?filter=pending` → list.
5. `PATCH /api/admin/technicians/:userId/verified` with `{ "verified": true }`.
6. Sign in as non-admin → `GET /api/admin/stats` → `403`.
