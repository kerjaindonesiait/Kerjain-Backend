import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { canAccessJobMessages, getJobForMessaging } from "../utils/messages.js";

const router = Router();

/** Supabase embeds may return a row or an array depending on relationship typing. */
function unwrapJoin<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapMessage(row: {
  id: string;
  job_id: string;
  technician_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}) {
  return {
    id: row.id,
    jobId: row.job_id,
    technicianId: row.technician_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
}

router.get("/conversations", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const viewer = req.user!;

    if (viewer.role === "technician") {
      const { data: offers, error } = await db
        .from("offers")
        .select("job_id, technician_id, job:jobs(id, title, user_id)")
        .eq("technician_id", viewer.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const threads = await Promise.all(
        (offers ?? []).map(async (o) => {
          const job = unwrapJoin(o.job);
          if (!job) return null;

          const { data: owner } = await db
            .from("users")
            .select("full_name, email")
            .eq("id", job.user_id)
            .single();

          const { data: lastMsg } = await db
            .from("messages")
            .select("body, created_at, sender_id")
            .eq("job_id", job.id)
            .eq("technician_id", viewer.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            jobId: job.id,
            jobTitle: job.title,
            technicianId: viewer.id,
            otherPartyName: owner?.full_name ?? owner?.email ?? "Pelanggan",
            lastMessage: lastMsg?.body ?? null,
            lastMessageAt: lastMsg?.created_at ?? null,
            isLastFromMe: lastMsg?.sender_id === viewer.id,
          };
        }),
      );

      return res.json({ conversations: threads.filter(Boolean) });
    }

    const { data: jobs, error: jobsErr } = await db
      .from("jobs")
      .select("id, title")
      .eq("user_id", viewer.id)
      .order("created_at", { ascending: false });

    if (jobsErr) throw jobsErr;

    const conversations: Array<{
      jobId: string;
      jobTitle: string;
      technicianId: string;
      otherPartyName: string;
      lastMessage: string | null;
      lastMessageAt: string | null;
      isLastFromMe: boolean;
    }> = [];

    for (const job of jobs ?? []) {
      const { data: offers } = await db
        .from("offers")
        .select("technician_id, technician:users!offers_technician_id_fkey(full_name, email)")
        .eq("job_id", job.id);

      for (const offer of offers ?? []) {
        const tech = unwrapJoin(offer.technician);
        const { data: lastMsg } = await db
          .from("messages")
          .select("body, created_at, sender_id")
          .eq("job_id", job.id)
          .eq("technician_id", offer.technician_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        conversations.push({
          jobId: job.id,
          jobTitle: job.title,
          technicianId: offer.technician_id,
          otherPartyName: tech?.full_name ?? tech?.email ?? "Tukang",
          lastMessage: lastMsg?.body ?? null,
          lastMessageAt: lastMsg?.created_at ?? null,
          isLastFromMe: lastMsg?.sender_id === viewer.id,
        });
      }
    }

    conversations.sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });

    res.json({ conversations });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat percakapan" });
  }
});

router.get("/job/:jobId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const job = await getJobForMessaging(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Pekerjaan tidak ditemukan" });

    let technicianId = typeof req.query.technicianId === "string" ? req.query.technicianId : "";
    if (req.user!.role === "technician") {
      technicianId = req.user!.id;
    }
    if (!technicianId) {
      return res.status(400).json({ error: "technicianId wajib untuk percakapan ini" });
    }

    const allowed = await canAccessJobMessages(job, req.user!, technicianId);
    if (!allowed) return res.status(403).json({ error: "Akses pesan ditolak" });

    const { data, error } = await db
      .from("messages")
      .select("*")
      .eq("job_id", job.id)
      .eq("technician_id", technicianId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const [{ data: owner }, { data: technician }] = await Promise.all([
      db.from("users").select("id, full_name, email").eq("id", job.user_id).single(),
      db.from("users").select("id, full_name, email").eq("id", technicianId).single(),
    ]);

    res.json({
      job: { id: job.id, title: job.title },
      technicianId,
      owner: owner
        ? { id: owner.id, name: owner.full_name ?? owner.email }
        : { id: job.user_id, name: "Pelanggan" },
      technician: technician
        ? { id: technician.id, name: technician.full_name ?? technician.email }
        : { id: technicianId, name: "Tukang" },
      messages: (data ?? []).map(mapMessage),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat pesan" });
  }
});

router.post("/job/:jobId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
    if (!body) return res.status(400).json({ error: "Pesan tidak boleh kosong" });
    if (body.length > 4000) return res.status(400).json({ error: "Pesan terlalu panjang" });

    const job = await getJobForMessaging(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Pekerjaan tidak ditemukan" });

    let technicianId =
      typeof req.body.technicianId === "string" ? req.body.technicianId : "";
    if (req.user!.role === "technician") {
      technicianId = req.user!.id;
    }
    if (!technicianId) {
      return res.status(400).json({ error: "technicianId wajib untuk mengirim pesan" });
    }

    const allowed = await canAccessJobMessages(job, req.user!, technicianId);
    if (!allowed) return res.status(403).json({ error: "Akses pesan ditolak" });

    const { data, error } = await db
      .from("messages")
      .insert({
        job_id: job.id,
        technician_id: technicianId,
        sender_id: req.user!.id,
        body,
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: mapMessage(data) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengirim pesan" });
  }
});

export default router;
