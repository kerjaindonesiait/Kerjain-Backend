import { db } from "../db.js";

export async function getPosterStats(userId: string) {
  const { data: user } = await db
    .from("users")
    .select("id, full_name, email, avatar_url")
    .eq("id", userId)
    .single();

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
  };
}
