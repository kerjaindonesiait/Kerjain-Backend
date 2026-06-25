# Reviews

Customers rate technicians after a job is completed. Public review lists feed technician profiles; ratings update aggregated technician stats.

## Overview

- Primary route prefix: `/api/reviews`
- Source: `src/routes/reviews.ts`
- Auth: public read for technician list; optional auth for job review; required `user` role to submit
- Related utils: `src/utils/reviewStats.ts`

## Required environment variables

Uses global Supabase config only (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

## List reviews for a technician

### `GET /api/reviews/technician/:id`

Public list of reviews for a technician (`reviewee_id`).

Query:

| Param | Default | Max |
| --- | --- | --- |
| `limit` | 10 | 50 |

Response:

```json
{
  "reviews": [
    {
      "id": "...",
      "jobId": "...",
      "reviewerId": "...",
      "revieweeId": "...",
      "rating": 5,
      "comment": "Pekerjaan rapi",
      "reviewerName": "Budi",
      "createdAt": "..."
    }
  ]
}
```

## Review for a job

### `GET /api/reviews/job/:jobId`

Optional auth. Returns the review for a job, or `null` if none.

Response:

```json
{
  "review": {
    "id": "...",
    "jobId": "...",
    "rating": 5,
    "comment": null,
    "reviewerName": "Budi",
    "createdAt": "..."
  }
}
```

## Submit a review

### `POST /api/reviews/job/:jobId`

Requires `kerjain_access` cookie and `user` role.

Request:

```json
{
  "rating": 5,
  "comment": "Pekerjaan rapi dan cepat"
}
```

Behavior:

- Job must exist, belong to the current user, status `completed`, and have `assigned_technician_id`.
- One review per job per customer.
- Updates technician aggregate rating via `refreshTechnicianRating`.

Response `201`:

```json
{
  "review": {
    "id": "...",
    "jobId": "...",
    "rating": 5,
    "comment": "Pekerjaan rapi dan cepat",
    "reviewerName": "Budi",
    "createdAt": "..."
  }
}
```

## Errors

| Status | Meaning |
| --- | --- |
| 400 | Invalid rating, job not completed, no assigned technician |
| 403 | Not the job owner |
| 404 | Job not found |
| 409 | Review already exists for this job |

## Frontend integration

```ts
fetch(`${API_URL}/api/reviews/technician/${technicianUserId}`, {
  credentials: "include",
});
```

Submit after payment/job completion:

```ts
fetch(`${API_URL}/api/reviews/job/${jobId}`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ rating: 5, comment: "..." }),
});
```

## Verification checklist

1. Complete a job as customer (status `completed`, technician assigned).
2. `POST /api/reviews/job/:jobId` with rating 1–5 → `201`.
3. Repeat → `409`.
4. `GET /api/reviews/job/:jobId` → same review.
5. `GET /api/reviews/technician/:technicianUserId` → list includes the review.
