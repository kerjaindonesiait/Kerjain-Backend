# Migration from KerjaIn-frontend `backend/`

This document records how the embedded API in **KerjaIn-frontend** (`backend/`) differs from **Kerjain-Backend**, which is now the source of truth.

Use it before removing `KerjaIn-frontend/backend/` to confirm nothing important was left behind, and to plan frontend integration work.

## Repository layout

| Item | KerjaIn-frontend (legacy) | Kerjain-Backend (canonical) |
| --- | --- | --- |
| Location | `KerjaIn-frontend/backend/` | Standalone repo |
| Env file | Shared root `.env` (`../../.env` from backend) | Repo-root `.env` / `.env.production` |
| Dev command | `npm run dev:api` or `npm run dev:all` from frontend root | `npm run dev` in backend repo |
| DB migrations | `KerjaIn-frontend/supabase/migrations/` | Not in repo yet — migrations still live in frontend |
| Build / prod | `tsx` only | `npm run build` + `node dist/index.js` |

## File inventory

### Carried over (same responsibility, evolved implementation)

| Legacy path | Canonical path | Notes |
| --- | --- | --- |
| `backend/src/index.ts` | `src/index.ts` | Upload route mounted; larger JSON limit for uploads |
| `backend/src/config.ts` | `src/config.ts` | Production validation, CORS origins, cookie security |
| `backend/src/db.ts` | `src/db.ts` | Same Supabase service-role client |
| `backend/src/middleware/auth.ts` | `src/middleware/auth.ts` | Cookie-first auth; `optionalAuth`, `requireAdmin` |
| `backend/src/routes/auth.ts` | `src/routes/auth.ts` | HttpOnly cookies; OAuth hardening |
| `backend/src/routes/jobs.ts` | `src/routes/jobs.ts` | Validation, geocoding, cancel endpoint |
| `backend/src/routes/offers.ts` | `src/routes/offers.ts` | Largely aligned |
| `backend/src/routes/technicians.ts` | `src/routes/technicians.ts` | Public profile endpoint added |
| `backend/src/routes/payments.ts` | `src/routes/payments.ts` | Largely aligned |
| `backend/src/utils/*.ts` | `src/utils/*.ts` | Several new helpers (see below) |

### New in Kerjain-Backend only

| Path | Purpose |
| --- | --- |
| `src/utils/cookies.ts` | HttpOnly cookie set/read/clear; OAuth redirect helper |
| `src/utils/admin.ts` | Admin access via `ADMIN_EMAILS` |
| `src/utils/settings.ts` | App-wide admin settings |
| `src/utils/geocode.ts` | Job location geocoding |
| `src/utils/jobValidation.ts` | Zod-style validation for job creation |
| `src/utils/jobWorkspace.ts` | Job workspace helpers |
| `src/utils/reviewStats.ts` | Technician review aggregates |
| `src/utils/dbErrors.ts` | Shared DB error mapping |
| `src/utils/phone.ts` | Customer phone resolution |
| `src/routes/upload.ts` | Job photo upload to Supabase Storage |
| `src/routes/reviews.ts` | Job reviews (implemented, not yet mounted in `index.ts`) |
| `src/routes/admin.ts` | Admin dashboard API (implemented, not yet mounted) |
| `src/routes/app.ts` | Public app config (implemented, not yet mounted) |
| `docs/authentication.md` | Auth contract for frontend and Postman |

### Still only in KerjaIn-frontend

| Path | Action needed |
| --- | --- |
| `KerjaIn-frontend/backend/` (entire folder) | Archive reference, then delete from frontend repo |
| `KerjaIn-frontend/supabase/migrations/` | Decide home: backend repo, Supabase project, or shared infra repo |
| `KerjaIn-frontend/.env.example` | Split into frontend-only and backend-only examples |
| `KerjaIn-frontend/package.json` scripts `dev:api`, `dev:all` | Remove after frontend points at external API |
| `KerjaIn-frontend/docs/FACEBOOK_OAUTH_SETUP.md` | Update or retire — Facebook OAuth disabled in canonical backend |

## Behavioral diffs (breaking for frontend)

### 1. Authentication transport

| Topic | Legacy embedded backend | Kerjain-Backend |
| --- | --- | --- |
| Login / refresh response | Returns `accessToken` and `refreshToken` in JSON | Returns `user` only; tokens in HttpOnly cookies |
| Frontend storage | `localStorage` (`kerjain_access`, `kerjain_refresh`) in `src/lib/api.ts` | Must use `credentials: "include"`; no token storage |
| `requireAuth` | `Authorization: Bearer` header only | Cookie first; Bearer still accepted as fallback |
| Register | May return tokens / auto-login in some flows | No session until email verified + login |
| OAuth callback | Redirect with `?access_token=&refresh_token=` in URL | Redirect with `?oauth=success` only; cookies set server-side |
| OAuth state | Base64 JSON in query param | Signed JWT in `state` |
| Facebook OAuth | Active when env vars set | Explicitly disabled (`oauth_unavailable`) |
| Logout | Required auth header; body may send `refreshToken` | Reads refresh cookie; clears cookies without requiring access token |

See [authentication.md](./authentication.md) for the target contract.

### 2. Config and deployment

| Env / setting | Legacy | Canonical |
| --- | --- | --- |
| `FRONTEND_URL` | Simple default | Required in production; localhost guard |
| `API_PUBLIC_URL` / `BACKEND_URL` | Not used | Drives OAuth redirect URIs when explicit URI omitted |
| `CORS_ORIGINS` | Not used | Extra allowed origins beyond `FRONTEND_URL` |
| `COOKIE_SECURE` | Not used | `true` in production or when explicitly set |
| `ADMIN_EMAILS` | Not used | Comma-separated admin allowlist |
| `NODE_ENV=production` | Not distinguished | Stricter env validation + `.env.production` overlay |

### 3. API surface

**Mounted in both** (`index.ts`):

- `GET /health`
- `/api/auth/*` and `/auth/*` (OAuth browser routes)
- `/api/jobs/*`
- `/api/offers/*`
- `/api/technicians/*`
- `/api/payments/*`

**Added in canonical backend only:**

| Method | Path | Status |
| --- | --- | --- |
| `POST` | `/api/jobs/:id/cancel` | Mounted |
| `POST` | `/api/upload/job-photo` | Mounted |
| `DELETE` | `/api/upload/job-photo` | Mounted |
| `GET` | `/api/technicians/:id/public` | Mounted |
| `GET` | `/api/reviews/technician/:id` | Mounted |
| `GET` | `/api/reviews/job/:jobId` | Mounted |
| `POST` | `/api/reviews/job/:jobId` | Mounted |
| `GET` | `/api/admin/*` | Mounted |
| `GET` | `/api/app/config` | Mounted |

**Jobs list behavior:** canonical `GET /api/jobs` uses `optionalAuth` so responses can vary for signed-in users.

## Frontend integration checklist

Work in **KerjaIn-frontend** after the embedded backend is removed:

1. Set `VITE_API_URL` to the deployed Kerjain-Backend URL (or `http://localhost:3000` locally).
2. Refactor `src/lib/api.ts` to drop `localStorage` tokens; add `credentials: "include"` on all API calls.
3. Update `AuthCallback.tsx` to handle `?oauth=success` instead of hash/query tokens.
4. Run backend and frontend as separate processes (no `dev:all`).
5. Verify cross-origin cookies: API and frontend domains must match the cookie/CORS setup in production.
6. Retire or rewrite docs that reference `cd backend && npm run dev`.

## Suggested removal order

1. Keep this doc and [authentication.md](./authentication.md) as the contract reference.
2. Tag the frontend repo (e.g. `legacy/embedded-backend`) so the old `backend/` folder remains in git history.
3. Complete frontend auth migration against Kerjain-Backend locally.
4. Mount any remaining route modules (`admin`, `reviews`, `app`) and document them per [feature-documentation.md](./feature-documentation.md).
5. Move or duplicate Supabase migrations into the backend workflow.
6. Delete `KerjaIn-frontend/backend/` and coupled scripts/env entries.

## Quick diff command

From your machine (both repos checked out side by side):

```bash
diff -rq \
  /path/to/KerjaIn-frontend/backend/src \
  /path/to/Kerjain-Backend/src
```

Re-run after major backend changes to refresh the inventory above.
