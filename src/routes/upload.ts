import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";

const router = Router();
const BUCKET = "job-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);

router.post("/job-photo", requireAuth, requireRole("user"), async (req: AuthedRequest, res) => {
  try {
    const { fileBase64, contentType = "image/jpeg" } = req.body as {
      fileBase64?: string;
      contentType?: string;
    };

    if (!fileBase64) {
      return res.status(400).json({ error: "File foto wajib diisi" });
    }

    const mime = contentType.toLowerCase();
    if (!ALLOWED.has(mime)) {
      return res.status(400).json({ error: "Format foto harus JPEG, PNG, atau WebP" });
    }

    const buffer = Buffer.from(fileBase64, "base64");
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json({ error: "Ukuran foto maksimal 5 MB" });
    }
    if (buffer.length < 100) {
      return res.status(400).json({ error: "File foto tidak valid" });
    }

    const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
    const path = `draft/${req.user!.id}/${randomUUID()}.${ext}`;

    const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
      contentType: mime,
      upsert: false,
    });

    if (error) {
      console.error("Storage upload error:", error);
      return res.status(500).json({ error: "Gagal mengunggah foto. Pastikan bucket job-photos ada di Supabase." });
    }

    const { data } = db.storage.from(BUCKET).getPublicUrl(path);
    res.status(201).json({ url: data.publicUrl, path });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengunggah foto" });
  }
});

function isOwnedPhotoPath(path: string, userId: string) {
  return path.startsWith(`draft/${userId}/`) || path.startsWith(`${userId}/`);
}

router.delete("/job-photo", requireAuth, requireRole("user"), async (req: AuthedRequest, res) => {
  try {
    const { path } = req.body as { path?: string };
    if (!path || !isOwnedPhotoPath(path, req.user!.id)) {
      return res.status(403).json({ error: "Tidak diizinkan menghapus foto ini" });
    }

    const { error } = await db.storage.from(BUCKET).remove([path]);
    if (error) {
      console.error("Storage delete error:", error);
      return res.status(500).json({ error: "Gagal menghapus foto" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus foto" });
  }
});

export default router;
