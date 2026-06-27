import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole, optionalAuth, type AuthedRequest } from "../middleware/auth.js";
import { refreshTechnicianRating } from "../utils/reviewStats.js";
import { enrichReviews, mapReviewRow } from "../utils/reviewEnrichment.js";

const router = Router();

router.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { data, error } = await db
      .from("reviews")
      .select("id, job_id, reviewer_id, reviewee_id, rating, comment, created_at")
      .eq("reviewer_id", req.user!.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const reviews = await enrichReviews(data ?? []);
    res.json({ reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat ulasan Anda" });
  }
});

router.get("/technician/:id", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { data, error } = await db
      .from("reviews")
      .select("id, job_id, reviewer_id, reviewee_id, rating, comment, created_at")
      .eq("reviewee_id", req.params.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const reviews = await enrichReviews(data ?? []);
    res.json({ reviews });
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

    const [review] = await enrichReviews([data]);
    res.json({ review });
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
      .select("id, user_id, assigned_technician_id, status, title")
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

    const { data: reviewee } = await db
      .from("users")
      .select("full_name")
      .eq("id", job.assigned_technician_id)
      .single();

    res.status(201).json({
      review: mapReviewRow(data, {
        reviewerName: reviewer?.full_name ?? undefined,
        revieweeName: reviewee?.full_name ?? undefined,
        jobTitle: job.title,
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan ulasan" });
  }
});

export default router;
