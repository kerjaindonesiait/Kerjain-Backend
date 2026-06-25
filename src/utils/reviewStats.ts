import { db } from "../db.js";

export async function refreshTechnicianRating(technicianId: string) {
  const { data: reviews, error } = await db
    .from("reviews")
    .select("rating")
    .eq("reviewee_id", technicianId);

  if (error) throw error;

  const count = reviews?.length ?? 0;
  const avg =
    count > 0
      ? reviews!.reduce((sum, r) => sum + r.rating, 0) / count
      : 0;

  const rating = Math.round(avg * 10) / 10;

  const { error: updateErr } = await db
    .from("technician_profiles")
    .update({ rating, review_count: count })
    .eq("user_id", technicianId);

  if (updateErr) throw updateErr;

  return { rating, reviewCount: count };
}
