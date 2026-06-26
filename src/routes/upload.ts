import { Router } from "express";
import { randomUUID } from "crypto";
import { db } from "../db.js";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { KTP_BUCKET, isOwnedKtpPath, signKtpPath } from "../utils/ktpStorage.js";

const router = Router();
const JOB_BUCKET = "job-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"]);

type KtpDocKind = "ktp" | "selfie";

function decodeImage(fileBase64: string, contentType: string) {
  const mime = contentType.toLowerCase();
  if (!ALLOWED.has(mime)) {
    return { error: "Format foto harus JPEG, PNG, atau WebP" as const };
  }

  const buffer = Buffer.from(fileBase64, "base64");
  if (buffer.length > MAX_BYTES) {
    return { error: "Ukuran foto maksimal 5 MB" as const };
  }
  if (buffer.length < 100) {
    return { error: "File foto tidak valid" as const };
  }

  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { mime, buffer, ext };
}

router.post("/job-photo", requireAuth, requireRole("user"), async (req: AuthedRequest, res) => {
  try {
    const { fileBase64, contentType = "image/jpeg" } = req.body as {
      fileBase64?: string;
      contentType?: string;
    };

    if (!fileBase64) {
      return res.status(400).json({ error: "File foto wajib diisi" });
    }

    const decoded = decodeImage(fileBase64, contentType);
    if ("error" in decoded) {
      return res.status(400).json({ error: decoded.error });
    }

    const path = `draft/${req.user!.id}/${randomUUID()}.${decoded.ext}`;

    const { error } = await db.storage.from(JOB_BUCKET).upload(path, decoded.buffer, {
      contentType: decoded.mime,
      upsert: false,
    });

    if (error) {
      console.error("Storage upload error:", error);
      return res.status(500).json({ error: "Gagal mengunggah foto. Pastikan bucket job-photos ada di Supabase." });
    }

    const { data } = db.storage.from(JOB_BUCKET).getPublicUrl(path);
    res.status(201).json({ url: data.publicUrl, path });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengunggah foto" });
  }
});

function isOwnedJobPhotoPath(path: string, userId: string) {
  return path.startsWith(`draft/${userId}/`) || path.startsWith(`${userId}/`);
}

router.delete("/job-photo", requireAuth, requireRole("user"), async (req: AuthedRequest, res) => {
  try {
    const { path } = req.body as { path?: string };
    if (!path || !isOwnedJobPhotoPath(path, req.user!.id)) {
      return res.status(403).json({ error: "Tidak diizinkan menghapus foto ini" });
    }

    const { error } = await db.storage.from(JOB_BUCKET).remove([path]);
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

router.post("/ktp-document", requireAuth, requireRole("technician"), async (req: AuthedRequest, res) => {
  try {
    const { fileBase64, contentType = "image/jpeg", kind } = req.body as {
      fileBase64?: string;
      contentType?: string;
      kind?: KtpDocKind;
    };

    if (!fileBase64) {
      return res.status(400).json({ error: "File foto wajib diisi" });
    }
    if (kind !== "ktp" && kind !== "selfie") {
      return res.status(400).json({ error: "Jenis dokumen harus ktp atau selfie" });
    }

    const decoded = decodeImage(fileBase64, contentType);
    if ("error" in decoded) {
      return res.status(400).json({ error: decoded.error });
    }

    const path = `${req.user!.id}/${kind}/${randomUUID()}.${decoded.ext}`;

    const { error } = await db.storage.from(KTP_BUCKET).upload(path, decoded.buffer, {
      contentType: decoded.mime,
      upsert: false,
    });

    if (error) {
      console.error("KTP storage upload error:", error);
      return res.status(500).json({ error: "Gagal mengunggah dokumen. Pastikan bucket ktp-documents ada di Supabase." });
    }

    const previewUrl = await signKtpPath(path);
    res.status(201).json({ path, previewUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengunggah dokumen" });
  }
});

router.delete("/ktp-document", requireAuth, requireRole("technician"), async (req: AuthedRequest, res) => {
  try {
    const { path } = req.body as { path?: string };
    if (!path || !isOwnedKtpPath(path, req.user!.id)) {
      return res.status(403).json({ error: "Tidak diizinkan menghapus dokumen ini" });
    }

    const { error } = await db.storage.from(KTP_BUCKET).remove([path]);
    if (error) {
      console.error("KTP storage delete error:", error);
      return res.status(500).json({ error: "Gagal menghapus dokumen" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menghapus dokumen" });
  }
});

export default router;
