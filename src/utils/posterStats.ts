import { db } from "../db.js";

export async function getPosterStats(userId: string) {
  const { data: user } = await db
    .from("users")
    .select("id, full_name, email, avatar_url, created_at")
    .eq("id", userId)
    .single();

  const { count: totalJobs } = await db
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("status", "cancelled");

  const { count: completedJobs } = await db
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "completed");

  const posted = totalJobs ?? 0;
  const completed = completedJobs ?? 0;
  const completionRate =
    posted > 0 ? Math.round((completed / posted) * 100) : 0;

  const memberSince = user?.created_at
    ? new Date(user.created_at).getFullYear().toString()
    : "—";

  const initials = user?.full_name
    ? user.full_name
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "??";

  return {
    name: user?.full_name ?? user?.email ?? "Pelanggan",
    initials,
    color: "#2E5090",
    avatarUrl: user?.avatar_url ?? null,
    rating: null as number | null,
    reviews: 0,
    memberSince,
    completionRate,
    jobsPosted: posted,
    jobsCompleted: completed,
  };
}
