# Feature documentation framework

Every user-facing or integration-sensitive backend capability gets its own markdown file under `docs/`. [authentication.md](./authentication.md) is the reference example.

This page defines **how we write those docs** so frontend, QA, and future backend work share one contract.

## When to add a doc

Create `docs/<feature>.md` when:

- A new route module is added or mounted (`src/routes/<feature>.ts`)
- Request/response shape, auth rules, or env vars are not obvious from code alone
- Frontend must change behavior (cookies, redirects, file upload, webhooks, etc.)
- You need a Postman or manual test checklist

Skip a standalone doc only for trivial internals (single helper, no API surface).

## File naming

| Pattern | Example |
| --- | --- |
| One word, lowercase | `jobs.md`, `payments.md`, `upload.md` |
| Multi-word, hyphenated | `job-workspace.md` |
| Domain term matches route prefix | `/api/admin/*` → `admin.md` |

Link every doc from the root [README.md](../README.md) documentation index.

## Document template

Copy the block below into a new file and fill in each section. Delete sections that do not apply.

```markdown
# <Feature name>

One sentence: what this feature does and who uses it (user, technician, admin, public).

## Overview

- Primary route prefix: `/api/<prefix>`
- Source: `src/routes/<file>.ts`
- Auth: none | optional | required | role-specific | admin
- Related utils: `src/utils/...`

## Required environment variables

List only vars this feature needs beyond global config.

```env
EXAMPLE_KEY=
```

Local vs production notes if behavior differs.

## <Flow or endpoint group name>

### <HTTP method> <path>

Brief purpose.

Request:

```json
{}
```

Behavior:

- Bullet list of server-side rules, side effects, and error cases.

Response:

```json
{}
```

Repeat for each endpoint or logical flow.

## Frontend integration

How the KerjaIn frontend should call this API:

- `fetch` options (`credentials`, headers, content type)
- Redirect or browser navigation (for OAuth-style flows)
- What **not** to do (e.g. do not store tokens in `localStorage`)

## Errors

| Status | Meaning | Typical cause |
| --- | --- | --- |
| 400 | ... | ... |
| 401 | ... | ... |

## Verification checklist

Numbered steps for Postman, curl, or browser:

1. ...
2. ...

## Changelog (optional)

| Date | Change |
| --- | --- |
| YYYY-MM-DD | Initial doc |
```

## Writing rules (match authentication.md)

1. **Contract first** — Document what callers send and receive, not implementation trivia.
2. **Show real paths** — Use full paths (`POST /api/jobs`, not “create job endpoint”).
3. **Behavior bullets** — List side effects: DB writes, emails, cookies, storage, status transitions.
4. **JSON examples** — Request and response bodies for happy path; mention key error shapes.
5. **Env vars** — Only document variables the feature actually reads.
6. **Frontend section** — Always state cookie/credentials, CORS, and redirect expectations when relevant.
7. **Checklist last** — End with steps someone can run without reading the source.
8. **Keep it current** — When you change a route, update the doc in the same PR.

## Workflow for a new feature

```text
1. Implement route + utils in src/
2. Mount route in src/index.ts (if applicable)
3. Add docs/<feature>.md from template above
4. Link doc in README.md
5. If frontend contract changes, note it in docs/migration-from-frontend-backend.md
   or the feature doc's Frontend integration section
```

## Documentation index (planned)

| Doc | Route prefix | Status |
| --- | --- | --- |
| [authentication.md](./authentication.md) | `/api/auth`, `/auth` | Done |
| [reviews.md](./reviews.md) | `/api/reviews` | Done |
| [admin.md](./admin.md) | `/api/admin` | Done |
| [app.md](./app.md) | `/api/app` | Done |
| `jobs.md` | `/api/jobs` | Not written |
| `offers.md` | `/api/offers` | Not written |
| `technicians.md` | `/api/technicians` | Not written |
| `payments.md` | `/api/payments` | Not written |
| `upload.md` | `/api/upload` | Not written |

Add a row to this table when you ship a new doc. Remove "Not written" when the file exists.

## Reference example

[authentication.md](./authentication.md) demonstrates:

- Cookie model table
- Env blocks for local and production
- Per-flow sections (register, login, OAuth)
- Explicit "does not" behavior (no JWTs in JSON, no tokens in redirect URLs)
- Postman verification checklist

New feature docs should feel like they belong in the same set.
