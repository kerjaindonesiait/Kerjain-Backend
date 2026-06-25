import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole, optionalAuth, type AuthedRequest } from "../middleware/auth.js";
import { refreshTechnicianRating } from "../utils/reviewStats.js";

const router = Router();

function mapReview(row: Record<string, unknown>, reviewerName?: string) {
  return {
    id: row.id,
    jobId: row.job_id,
    reviewerId: row.reviewer_id,
    revieweeId: row.reviewee_id,
    rating: row.rating,
    comment: row.comment ?? null,
    reviewerName: reviewerName ?? null,
    createdAt: row.created_at,
  };
}

router.get("/technician/:id", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const { data, error } = await db
      .from("reviews")
      .select("id, job_id, reviewer_id, reviewee_id, rating, comment, created_at")
      .eq("reviewee_id", req.params.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const reviewerIds = [...new Set((data ?? []).map((r) => r.reviewer_id))];
    const names: Record<string, string> = {};
    if (reviewerIds.length > 0) {
      const { data: users } = await db.from("users").select("id, full_name").in("id", reviewerIds);
      for (const u of users ?? []) {
        names[u.id] = u.full_name ?? "Pelanggan";
      }
    }

    res.json({
      reviews: (data ?? []).map((r) => mapReview(r, names[r.reviewer_id])),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat ulasan" });
  }
});

router.get("/job/:jobId", optionalAuth, async (req, res) => {
  try {
    const { data, error } = await db
      .from("reviews")
      .select("*")
      .eq("job_id", req.params.jobId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.json({ review: null });

    const { data: reviewer } = await db
      .from("users")
      .select("full_name")
      .eq("id", data.reviewer_id)
      .single();

    res.json({ review: mapReview(data, reviewer?.full_name ?? undefined) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat ulasan" });
  }
});

router.post("/job/:jobId", requireAuth, requireRole("user"), async (req: AuthedRequest, res) => {
  try {
    const rating = Number(req.body?.rating);
    const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating harus antara 1 dan 5" });
    }
    if (comment.length > 2000) {
      return res.status(400).json({ error: "Ulasan maksimal 2000 karakter" });
    }

    const { data: job, error: jobErr } = await db
      .from("jobs")
      .select("id, user_id, assigned_technician_id, status")
      .eq("id", req.params.jobId)
      .single();

    if (jobErr || !job) return res.status(404).json({ error: "Pekerjaan tidak ditemukan" });
    if (job.user_id !== req.user!.id) {
      return res.status(403).json({ error: "Hanya pemilik pekerjaan yang dapat memberi ulasan" });
    }
    if (job.status !== "completed") {
      return res.status(400).json({ error: "Ulasan hanya untuk pekerjaan yang sudah selesai" });
    }
    if (!job.assigned_technician_id) {
      return res.status(400).json({ error: "Tidak ada tukang yang ditugaskan" });
    }

    const { data: existing } = await db
      .from("reviews")
      .select("id")
      .eq("job_id", job.id)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: "Anda sudah memberi ulasan untuk pekerjaan ini" });
    }

    const { data, error } = await db
      .from("reviews")
      .insert({
        job_id: job.id,
        reviewer_id: req.user!.id,
        reviewee_id: job.assigned_technician_id,
        rating,
        comment: comment || null,
      })
      .select()
      .single();

    if (error) throw error;

    await refreshTechnicianRating(job.assigned_technician_id);

    const { data: reviewer } = await db
      .from("users")
      .select("full_name")
      .eq("id", req.user!.id)
      .single();

    res.status(201).json({
      review: mapReview(data, reviewer?.full_name ?? undefined),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan ulasan" });
  }
});

export default router;
