import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, optionalAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { geocodeJobLocation } from "../utils/geocode.js";
import { validateCreateJobBody } from "../utils/jobValidation.js";
import { markTechnicianJobDone, releaseEscrowForJob, workspaceViewerRole } from "../utils/jobWorkspace.js";
import { notifyPosterJobMarkedDone } from "../utils/jobDoneNotify.js";
import { getPosterStats } from "../utils/posterStats.js";

const router = Router();

const CATEGORY_LABELS: Record<string, string> = {
  darurat: "Pipa Bocor Darurat",
  deteksi: "Deteksi Kebocoran",
  mampet: "Saluran Mampet",
  water: "Pemanas Air",
  pipa: "Ganti Pipa",
  bathroom: "Pasang Kamar Mandi",
  maintenance: "Perawatan Umum",
  handyman: "Tukang Serba Bisa",
  pintu: "Perbaikan Pintu",
  talang: "Bersih Talang",
  keramik: "Perbaikan Keramik",
  atap: "Perawatan Atap",
};

function generateJobNumber() {
  const yr = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `#KJ-${yr}-${rand}`;
}

function deriveTitle(category: string, description: string) {
  const label = CATEGORY_LABELS[category] ?? category;
  const firstLine = description.split("\n")[0]?.trim();
  if (firstLine && firstLine.length <= 80) return firstLine;
  return `${label} – ${description.slice(0, 60).trim()}…`;
}

function parseBudget(budget: string | undefined): number | null {
  if (!budget) return null;
  const digits = budget.replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  if (budget.toLowerCase().includes("rb") || budget.toLowerCase().includes("ribu")) {
    return n * 1000;
  }
  return n;
}

function formatPrice(amount: number | null) {
  if (!amount) return "Minta penawaran";
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toFixed(1)}jt`;
  if (amount >= 1000) return `Rp ${Math.round(amount / 1000)}rb`;
  return `Rp ${amount}`;
}

function urgencyFromWaktu(waktuType: string) {
  if (waktuType === "asap") return "Segera";
  if (waktuType === "sebelum") return "Normal";
  return "Fleksibel";
}

async function enrichJob(job: Record<string, unknown>, viewerId?: string) {
  const isOwner = viewerId ? job.user_id === viewerId : false;

  let offerCount: number | null = null;
  if (isOwner) {
    const { count } = await db
      .from("offers")
      .select("*", { count: "exact", head: true })
      .eq("job_id", job.id);
    offerCount = count ?? 0;
  }

  const { data: poster } = await db
    .from("users")
    .select("id, full_name, email, avatar_url, created_at")
    .eq("id", job.user_id)
    .single();

  const posterStats = poster ? await getPosterStats(job.user_id as string) : null;

  const initials = posterStats?.initials ?? "??";

  return {
    id: job.id,
    jobNumber: job.job_number,
    category: job.category,
    title: job.title,
    description: job.description,
    photos: job.photos,
    area: job.area,
    alamat: job.alamat,
    latitude: job.latitude ?? null,
    longitude: job.longitude ?? null,
    lokasiType: job.lokasi_type,
    waktuType: job.waktu_type,
    tanggal: job.tanggal,
    budgetType: job.budget_type,
    budgetRaw: job.budget_raw,
    price: formatPrice(job.budget_raw as number | null),
    status: job.status,
    urgency: job.urgency,
    offers: offerCount,
    remote: job.lokasi_type === "remote",
    flexible: job.waktu_type === "fleksibel",
    date: job.tanggal ?? (job.waktu_type === "asap" ? "Hari ini" : null),
    time: job.urgency,
    initials,
    poster: posterStats,
    ownerId: job.user_id as string,
    isOwner,
    technicianCompletedAt: (job.technician_completed_at as string | null) ?? null,
    createdAt: job.created_at,
  };
}

router.get("/", optionalAuth, async (req: AuthedRequest, res) => {
  try {
    const { status = "open", search, area } = req.query;
    let query = db.from("jobs").select("*").order("created_at", { ascending: false });

    if (status) query = query.eq("status", status as string);
    if (area) query = query.eq("area", area as string);
    if (search) query = query.ilike("title", `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    let rows = data ?? [];
    if (req.user?.role === "technician") {
      rows = rows.filter((j) => j.user_id !== req.user!.id);
    }

    const jobs = await Promise.all(rows.map((j) => enrichJob(j, req.user?.id)));
    res.json({ jobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

router.get("/mine", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await db
      .from("jobs")
      .select("*")
      .eq("user_id", req.user!.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const jobs = await Promise.all((data ?? []).map((j) => enrichJob(j, req.user!.id)));
    res.json({ jobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch jobs" });
  }
});

router.get("/assigned", requireAuth, requireRole("technician"), async (req: AuthedRequest, res) => {
  try {
    const { status } = req.query;
    let query = db
      .from("jobs")
      .select("*")
      .eq("assigned_technician_id", req.user!.id)
      .order("created_at", { ascending: false });

    if (status && typeof status === "string") {
      query = query.eq("status", status);
    } else {
      query = query.in("status", ["assigned", "in_progress", "completed"]);
    }

    const { data, error } = await query;
    if (error) throw error;
    const jobs = await Promise.all((data ?? []).map((j) => enrichJob(j, req.user!.id)));
    res.json({ jobs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat pekerjaan yang ditugaskan" });
  }
});

router.post("/:id/cancel", requireAuth, requireRole("user"), async (req: AuthedRequest, res) => {
  try {
    const { data: job, error: fetchErr } = await db
      .from("jobs")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (fetchErr || !job) {
      return res.status(404).json({ error: "Pekerjaan tidak ditemukan" });
    }
    if (job.user_id !== req.user!.id) {
      return res.status(403).json({ error: "Anda tidak berhak membatalkan pekerjaan ini" });
    }
    if (job.status !== "open") {
      return res.status(400).json({ error: "Hanya pekerjaan terbuka yang bisa dibatalkan" });
    }

    const { data, error } = await db
      .from("jobs")
      .update({ status: "cancelled" })
      .eq("id", req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ job: await enrichJob(data, req.user!.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal membatalkan pekerjaan" });
  }
});

router.post("/:id/mark-done", requireAuth, requireRole("technician"), async (req: AuthedRequest, res) => {
  try {
    const { data: job, error: fetchErr } = await db
      .from("jobs")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (fetchErr || !job) {
      return res.status(404).json({ error: "Pekerjaan tidak ditemukan" });
    }
    if (job.assigned_technician_id !== req.user!.id) {
      return res.status(403).json({ error: "Hanya tukang yang ditugaskan yang dapat menandai selesai" });
    }
    if (job.status !== "in_progress") {
      return res.status(400).json({ error: "Hanya pekerjaan yang sedang berjalan yang bisa ditandai selesai" });
    }
    if (job.technician_completed_at) {
      return res.status(400).json({ error: "Pekerjaan sudah ditandai selesai — menunggu konfirmasi pelanggan" });
    }

    await markTechnicianJobDone(job.id);

    notifyPosterJobMarkedDone(job.id, req.user!.id).catch(console.error);

    const { data: updated, error } = await db.from("jobs").select("*").eq("id", job.id).single();
    if (error || !updated) throw error ?? new Error("Job not found after mark-done");

    res.json({ job: await enrichJob(updated, req.user!.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menandai pekerjaan selesai" });
  }
});

router.post("/:id/confirm-complete", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data: job, error: fetchErr } = await db
      .from("jobs")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (fetchErr || !job) {
      return res.status(404).json({ error: "Pekerjaan tidak ditemukan" });
    }
    if (workspaceViewerRole(job, req.user!) !== "owner") {
      return res.status(403).json({ error: "Hanya pemilik pekerjaan yang dapat mengonfirmasi selesai" });
    }
    if (job.status !== "in_progress") {
      return res.status(400).json({ error: "Pekerjaan tidak sedang berjalan" });
    }
    if (!job.technician_completed_at) {
      return res.status(400).json({ error: "Tukang belum menandai pekerjaan selesai" });
    }

    await releaseEscrowForJob(job.id);

    const { data: updated, error } = await db.from("jobs").select("*").eq("id", job.id).single();
    if (error || !updated) throw error ?? new Error("Job not found after confirm");

    res.json({ job: await enrichJob(updated, req.user!.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengonfirmasi pekerjaan" });
  }
});

router.post("/:id/complete", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data: job, error: fetchErr } = await db
      .from("jobs")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (fetchErr || !job) {
      return res.status(404).json({ error: "Pekerjaan tidak ditemukan" });
    }

    const role = workspaceViewerRole(job, req.user!);
    if (role === "technician") {
      if (job.assigned_technician_id !== req.user!.id) {
        return res.status(403).json({ error: "Anda tidak berhak menyelesaikan pekerjaan ini" });
      }
      if (job.status !== "in_progress") {
        return res.status(400).json({ error: "Hanya pekerjaan yang sedang berjalan yang bisa ditandai selesai" });
      }
      if (job.technician_completed_at) {
        return res.status(400).json({ error: "Sudah ditandai selesai — menunggu konfirmasi pelanggan" });
      }
      await markTechnicianJobDone(job.id);
      notifyPosterJobMarkedDone(job.id, req.user!.id).catch(console.error);
    } else if (role === "owner") {
      if (job.status !== "in_progress") {
        return res.status(400).json({ error: "Pekerjaan tidak sedang berjalan" });
      }
      if (!job.technician_completed_at) {
        return res.status(400).json({ error: "Tukang belum menandai pekerjaan selesai" });
      }
      await releaseEscrowForJob(job.id);
    } else {
      return res.status(403).json({ error: "Anda tidak berhak menyelesaikan pekerjaan ini" });
    }

    const { data: updated, error } = await db
      .from("jobs")
      .select("*")
      .eq("id", job.id)
      .single();

    if (error || !updated) throw error ?? new Error("Job not found after complete");

    res.json({ job: await enrichJob(updated, req.user!.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyelesaikan pekerjaan" });
  }
});

router.get("/:id", optionalAuth, async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await db.from("jobs").select("*").eq("id", req.params.id).single();
    if (error || !data) return res.status(404).json({ error: "Job not found" });
    res.json({ job: await enrichJob(data, req.user?.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch job" });
  }
});

router.post("/", requireAuth, requireRole("user"), async (req: AuthedRequest, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const validationErrors = validateCreateJobBody(body);
    if (Object.keys(validationErrors).length > 0) {
      return res.status(400).json({ error: "Periksa kembali formulir Anda", details: validationErrors });
    }

    const budgetRaw = body.budgetType === "minta" ? null : parseBudget(String(body.budget ?? ""));
    const coords = await geocodeJobLocation(String(body.area ?? ""), body.alamat as string | undefined);

    const photos = Array.isArray(body.photos)
      ? (body.photos as string[]).filter((p) => typeof p === "string" && p.startsWith("http"))
      : [];

    const { data, error } = await db
      .from("jobs")
      .insert({
        user_id: req.user!.id,
        job_number: generateJobNumber(),
        category: body.layanan ?? body.category,
        title: deriveTitle(String(body.layanan ?? body.category), String(body.deskripsi ?? body.description)),
        description: body.deskripsi ?? body.description,
        photos,
        lokasi_type: body.lokasiType ?? "lokasi",
        area: body.area,
        alamat: body.alamat ?? null,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        waktu_type: body.waktuType ?? "fleksibel",
        tanggal: body.tanggal || null,
        budget_type: body.budgetType ?? "tetap",
        budget_raw: budgetRaw,
        urgency: urgencyFromWaktu(String(body.waktuType ?? "fleksibel")),
        status: "open",
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ job: await enrichJob(data, req.user!.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create job" });
  }
});

export default router;
