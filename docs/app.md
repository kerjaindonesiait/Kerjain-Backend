# App config

Public read-only flags the frontend can use before or without admin access (maintenance mode, quoting rules).

## Overview

- Primary route prefix: `/api/app`
- Source: `src/routes/app.ts`
- Auth: none
- Related utils: `src/utils/settings.ts` (same `app_settings` table as admin)

## Required environment variables

Uses global Supabase config only (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

Settings are stored in `app_settings`; defaults apply when rows are missing:

| Key | Default |
| --- | --- |
| `require_verified_to_quote` | `false` |
| `maintenance_mode` | `false` |

## Public config

### `GET /api/app/config`

No auth required.

Response:

```json
{
  "config": {
    "requireVerifiedToQuote": false,
    "maintenanceMode": false
  }
}
```

Behavior:

- Reads from `app_settings` via `getAppSettings()`.
- Safe to call on app load (homepage, technician dashboard).

Admin updates use `PATCH /api/admin/settings` (see [admin.md](./admin.md)).

## Frontend integration

```ts
const res = await fetch(`${API_URL}/api/app/config`);
const { config } = await res.json();

if (config.maintenanceMode) {
  // show maintenance banner or block actions
}

if (config.requireVerifiedToQuote && !technician.verified) {
  // hide or disable quote UI
}
```

No `credentials: "include"` required for this endpoint.

## Errors

| Status | Meaning |
| --- | --- |
| 500 | Database read failed |

## Verification checklist

1. `GET /api/app/config` without cookies → `200` with defaults or stored values.
2. `PATCH /api/admin/settings` with `{ "maintenanceMode": true }` (as admin).
3. `GET /api/app/config` → `maintenanceMode: true`.
