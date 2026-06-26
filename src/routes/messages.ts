import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  getJobForMessaging,
  getOrCreateThread,
  resolvePeerId,
  technicianCanMessageOnJob,
} from "../utils/messages.js";

const router = Router();

type ThreadJob = { id: string; title: string; status: string; user_id: string };

function threadJob(raw: unknown): ThreadJob | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as ThreadJob | undefined) ?? null;
  return raw as ThreadJob;
}

function mapMessage(row: Record<string, unknown>, senderName?: string) {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderId: row.sender_id,
    senderName: senderName ?? "Pengguna",
    body: row.body,
    createdAt: row.created_at,
    isMine: false as boolean,
  };
}

router.get("/inbox", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const viewerId = req.user!.id;
    const isTechnician = req.user!.role === "technician";

    let query = db
      .from("job_message_threads")
      .select("id, job_id, technician_id, updated_at, job:jobs(id, title, status, user_id)")
      .order("updated_at", { ascending: false })
      .limit(50);

    if (isTechnician) {
      query = query.eq("technician_id", viewerId);
    }

    const { data: threads, error } = await query;
    if (error) throw error;

    const filtered = (threads ?? []).filter((t) => {
      const job = threadJob(t.job);
      if (!job) return false;
      if (isTechnician) return true;
      return job.user_id === viewerId;
    });

    const threadIds = filtered.map((t) => t.id);
    const lastByThread: Record<string, { body: string; created_at: string }> = {};
    if (threadIds.length > 0) {
      const { data: recent } = await db
        .from("job_messages")
        .select("thread_id, body, created_at")
        .in("thread_id", threadIds)
        .order("created_at", { ascending: false });
      for (const m of recent ?? []) {
        if (!lastByThread[m.thread_id]) {
          lastByThread[m.thread_id] = { body: m.body, created_at: m.created_at };
        }
      }
    }

    const peerIds = new Set<string>();
    for (const t of filtered) {
      const job = threadJob(t.job);
      if (!job) continue;
      peerIds.add(isTechnician ? job.user_id : t.technician_id);
    }

    const names: Record<string, string> = {};
    if (peerIds.size > 0) {
      const { data: users } = await db
        .from("users")
        .select("id, full_name, email")
        .in("id", [...peerIds]);
      for (const u of users ?? []) {
        names[u.id] = u.full_name ?? u.email;
      }
    }

    res.json({
      threads: filtered.map((t) => {
        const job = threadJob(t.job)!;
        const peerId = isTechnician ? job.user_id : t.technician_id;
        const last = lastByThread[t.id];
        return {
          id: t.id,
          jobId: t.job_id,
          jobTitle: job.title,
          jobStatus: job.status,
          peerId,
          peerName: names[peerId] ?? (isTechnician ? "Pelanggan" : "Tukang"),
          lastMessage: last?.body ?? null,
          lastMessageAt: last?.created_at ?? t.updated_at,
        };
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat pesan" });
  }
});

/** List messages for a job conversation. Query: peerId (required for job owner). */
router.get("/job/:jobId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const job = await getJobForMessaging(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Pekerjaan tidak ditemukan" });

    const peerId = await resolvePeerId(
      job,
      req.user!.id,
      req.user!.role,
      typeof req.query.peerId === "string" ? req.query.peerId : undefined,
    );
    if (!peerId) {
      return res.status(403).json({ error: "Tidak dapat mengakses percakapan ini" });
    }

    const technicianId = req.user!.role === "technician" ? req.user!.id : peerId;
    const thread = await getOrCreateThread(job.id, technicianId);

    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const { data: rows, error } = await db
      .from("job_messages")
      .select("id, thread_id, sender_id, body, created_at")
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw error;

    const senderIds = [...new Set((rows ?? []).map((r) => r.sender_id))];
    const names: Record<string, string> = {};
    if (senderIds.length > 0) {
      const { data: users } = await db.from("users").select("id, full_name, email").in("id", senderIds);
      for (const u of users ?? []) {
        names[u.id] = u.full_name ?? u.email;
      }
    }

    const [{ data: owner }, { data: technician }] = await Promise.all([
      db.from("users").select("id, full_name, email").eq("id", job.user_id).single(),
      db.from("users").select("id, full_name, email").eq("id", technicianId).single(),
    ]);

    res.json({
      threadId: thread.id,
      job: { id: job.id, title: job.title, status: job.status },
      peer: {
        id: peerId,
        name:
          peerId === job.user_id
            ? owner?.full_name ?? owner?.email ?? "Pelanggan"
            : technician?.full_name ?? technician?.email ?? "Tukang",
      },
      messages: (rows ?? []).map((r) => {
        const m = mapMessage(r, names[r.sender_id]);
        m.isMine = r.sender_id === req.user!.id;
        return m;
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat percakapan" });
  }
});

/** Send a message. Body: { body, peerId? } */
router.post("/job/:jobId", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) return res.status(400).json({ error: "Pesan tidak boleh kosong" });
    if (body.length > 4000) return res.status(400).json({ error: "Pesan terlalu panjang" });

    const job = await getJobForMessaging(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Pekerjaan tidak ditemukan" });

    const peerId = await resolvePeerId(
      job,
      req.user!.id,
      req.user!.role,
      typeof req.body?.peerId === "string" ? req.body.peerId : undefined,
    );
    if (!peerId) {
      return res.status(403).json({ error: "Tidak dapat mengirim pesan pada pekerjaan ini" });
    }

    const technicianId = req.user!.role === "technician" ? req.user!.id : peerId;
    if (req.user!.role === "user") {
      const ok = await technicianCanMessageOnJob(job.id, technicianId);
      if (!ok) return res.status(403).json({ error: "Tukang belum mengajukan penawaran pada pekerjaan ini" });
    }

    const thread = await getOrCreateThread(job.id, technicianId);
    const now = new Date().toISOString();

    const { data: message, error } = await db
      .from("job_messages")
      .insert({
        thread_id: thread.id,
        sender_id: req.user!.id,
        body,
      })
      .select("id, thread_id, sender_id, body, created_at")
      .single();

    if (error) throw error;

    await db.from("job_message_threads").update({ updated_at: now }).eq("id", thread.id);

    const { data: sender } = await db
      .from("users")
      .select("full_name, email")
      .eq("id", req.user!.id)
      .single();

    res.status(201).json({
      message: {
        ...mapMessage(message, sender?.full_name ?? sender?.email),
        isMine: true,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengirim pesan" });
  }
});

export default router;
