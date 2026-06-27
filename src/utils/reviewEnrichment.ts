import { db } from "../db.js";

export function mapReviewRow(
  row: Record<string, unknown>,
  extras?: {
    reviewerName?: string;
    revieweeName?: string;
    jobTitle?: string;
  },
) {
  return {
    id: row.id,
    jobId: row.job_id,
    reviewerId: row.reviewer_id,
    revieweeId: row.reviewee_id,
    rating: row.rating,
    comment: row.comment ?? null,
    reviewerName: extras?.reviewerName ?? null,
    revieweeName: extras?.revieweeName ?? null,
    jobTitle: extras?.jobTitle ?? null,
    createdAt: row.created_at,
  };
}

export async function enrichReviews(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return [];

  const jobIds = [...new Set(rows.map((r) => r.job_id as string))];
  const userIds = [
    ...new Set([
      ...rows.map((r) => r.reviewer_id as string),
      ...rows.map((r) => r.reviewee_id as string),
    ]),
  ];

  const jobTitles: Record<string, string> = {};
  const userNames: Record<string, string> = {};

  const [{ data: jobs }, { data: users }] = await Promise.all([
    db.from("jobs").select("id, title").in("id", jobIds),
    db.from("users").select("id, full_name").in("id", userIds),
  ]);

  for (const job of jobs ?? []) {
    jobTitles[job.id] = job.title;
  }
  for (const user of users ?? []) {
    userNames[user.id] = user.full_name ?? "Pengguna";
  }

  return rows.map((row) =>
    mapReviewRow(row, {
      reviewerName: userNames[row.reviewer_id as string],
      revieweeName: userNames[row.reviewee_id as string],
      jobTitle: jobTitles[row.job_id as string],
    }),
  );
}
