import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { sendNewOfferEmail, sendOfferAcceptedEmail } from "../utils/notifyEmails.js";
import { getAppSettings } from "../utils/settings.js";

const router = Router();

router.get("/job/:jobId", async (req, res) => {
  try {
    const { data, error } = await db
      .from("offers")
      .select("*, technician:users!offers_technician_id_fkey(id, full_name, avatar_url)")
      .eq("job_id", req.params.jobId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const offers = (data ?? []).map((o) => ({
      id: o.id,
      jobId: o.job_id,
      technicianId: o.technician_id,
      price: o.price,
      priceFormatted: `Rp ${Math.round(o.price / 1000)}rb`,
      message: o.message,
      availability: o.availability,
      scheduledTime: o.scheduled_time,
      status: o.status,
      technicianName: o.technician?.full_name ?? "Tukang",
      createdAt: o.created_at,
    }));

    res.json({ offers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch offers" });
  }
});

router.post("/job/:jobId", requireAuth, requireRole("technician"), async (req: AuthedRequest, res) => {
  try {
    const { price, message, availability = "segera", scheduledTime } = req.body;
    if (!price) return res.status(400).json({ error: "Price required" });

    const { data: job, error: jobErr } = await db
      .from("jobs")
      .select("id, user_id, status, title")
      .eq("id", req.params.jobId)
      .single();

    if (jobErr || !job) return res.status(404).json({ error: "Job not found" });
    if (job.user_id === req.user!.id) {
      return res.status(403).json({ error: "You cannot quote your own job" });
    }
    if (job.status !== "open") {
      return res.status(400).json({ error: "Job is no longer open for offers" });
    }

    const settings = await getAppSettings();
    if (settings.requireVerifiedToQuote) {
      const { data: profile } = await db
        .from("technician_profiles")
        .select("verified")
        .eq("user_id", req.user!.id)
        .maybeSingle();
      if (!profile?.verified) {
        return res.status(403).json({
          error: "Akun tukang belum diverifikasi. Tunggu persetujuan admin sebelum mengirim penawaran.",
        });
      }
    }

    const { data, error } = await db
      .from("offers")
      .insert({
        job_id: req.params.jobId,
        technician_id: req.user!.id,
        price: Number(price),
        message: message ?? null,
        availability,
        scheduled_time: scheduledTime ?? null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "You already quoted this job" });
      throw error;
    }

    const { data: owner } = await db
      .from("users")
      .select("email, full_name")
      .eq("id", job.user_id)
      .single();
    const techName = req.user!.email; // fallback
    const { data: tech } = await db
      .from("users")
      .select("full_name")
      .eq("id", req.user!.id)
      .single();

    if (owner?.email) {
      sendNewOfferEmail(
        owner.email,
        owner.full_name,
        job.title,
        tech?.full_name ?? techName,
        Number(price),
      ).catch(console.error);
    }

    res.status(201).json({ offer: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create offer" });
  }
});

router.get("/mine", requireAuth, requireRole("technician"), async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await db
      .from("offers")
      .select("*, job:jobs(*)")
      .eq("technician_id", req.user!.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json({ offers: data ?? [] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch offers" });
  }
});

router.post("/:id/accept", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data: offer, error: offerErr } = await db
      .from("offers")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (offerErr || !offer) return res.status(404).json({ error: "Penawaran tidak ditemukan" });

    const { data: job, error: jobErr } = await db
      .from("jobs")
      .select("id, user_id, status, title")
      .eq("id", offer.job_id)
      .single();

    if (jobErr || !job) return res.status(404).json({ error: "Pekerjaan tidak ditemukan" });
    if (job.user_id !== req.user!.id) {
      return res.status(403).json({ error: "Hanya pemilik pekerjaan yang dapat menerima penawaran" });
    }
    if (job.status !== "open") {
      return res.status(400).json({ error: "Pekerjaan tidak lagi terbuka untuk penawaran" });
    }

    await db.from("offers").update({ status: "accepted" }).eq("id", offer.id);
    await db
      .from("offers")
      .update({ status: "rejected" })
      .eq("job_id", offer.job_id)
      .neq("id", offer.id)
      .eq("status", "pending");

    await db
      .from("jobs")
      .update({
        status: "assigned",
        assigned_technician_id: offer.technician_id,
      })
      .eq("id", offer.job_id);

    const { data: tech } = await db
      .from("users")
      .select("email, full_name")
      .eq("id", offer.technician_id)
      .single();
    if (tech?.email) {
      sendOfferAcceptedEmail(tech.email, tech.full_name, job.title).catch(console.error);
    }

    res.json({ offer, jobId: offer.job_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menerima penawaran" });
  }
});

export default router;
