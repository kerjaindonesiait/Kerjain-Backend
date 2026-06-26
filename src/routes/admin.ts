import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "../middleware/auth.js";
import { isAdminEmail } from "../utils/admin.js";
import { sendTechnicianVerifiedEmail } from "../utils/authTokens.js";
import { getAppSettings, updateAppSettings } from "../utils/settings.js";

const router = Router();

function formatTechnician(row: {
  user_id: string;
  phone: string | null;
  area: string | null;
  nik: string | null;
  ktp_photo_url: string | null;
  selfie_photo_url: string | null;
  keahlian: string[];
  verified: boolean;
  created_at: string;
  users:
    | { id: string; email: string; full_name: string | null; created_at: string }
    | { id: string; email: string; full_name: string | null; created_at: string }[]
    | null;
}) {
  const user = Array.isArray(row.users) ? row.users[0] : row.users;
  return {
    userId: row.user_id,
    email: user?.email ?? "",
    fullName: user?.full_name ?? null,
    phone: row.phone,
    area: row.area,
    nik: row.nik,
    ktpPhotoUrl: row.ktp_photo_url,
    selfiePhotoUrl: row.selfie_photo_url,
    keahlian: row.keahlian ?? [],
    verified: row.verified,
    memberSince: user?.created_at ?? row.created_at,
    hasKtpSubmission: !!(row.ktp_photo_url && row.selfie_photo_url),
  };
}

router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ isAdmin: isAdminEmail(req.user!.email) });
});

router.get("/stats", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [{ count: pending }, { count: verified }, { count: technicians }, { count: openJobs }, { count: pendingEmails }] =
      await Promise.all([
        db
          .from("technician_profiles")
          .select("*", { count: "exact", head: true })
          .eq("verified", false)
          .not("ktp_photo_url", "is", null)
          .not("selfie_photo_url", "is", null),
        db.from("technician_profiles").select("*", { count: "exact", head: true }).eq("verified", true),
        db.from("technician_profiles").select("*", { count: "exact", head: true }),
        db.from("jobs").select("*", { count: "exact", head: true }).eq("status", "open"),
        db.from("users").select("*", { count: "exact", head: true }).eq("email_verified", false),
      ]);

    res.json({
      stats: {
        pendingVerification: pending ?? 0,
        verifiedTechnicians: verified ?? 0,
        totalTechnicians: technicians ?? 0,
        openJobs: openJobs ?? 0,
        pendingEmailVerification: pendingEmails ?? 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat statistik" });
  }
});

router.get("/technicians", requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = (req.query.filter as string) ?? "pending";

    let query = db
      .from("technician_profiles")
      .select(
        "user_id, phone, area, nik, ktp_photo_url, selfie_photo_url, keahlian, verified, created_at, users!technician_profiles_user_id_fkey(id, email, full_name, created_at)"
      )
      .order("created_at", { ascending: false });

    if (filter === "pending") {
      query = query
        .eq("verified", false)
        .not("ktp_photo_url", "is", null)
        .not("selfie_photo_url", "is", null);
    } else if (filter === "verified") {
      query = query.eq("verified", true);
    } else if (filter === "unverified") {
      query = query.eq("verified", false);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      technicians: (data ?? []).map((row) => formatTechnician(row as Parameters<typeof formatTechnician>[0])),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat daftar tukang" });
  }
});

router.patch("/technicians/:userId/verified", requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { verified, sendEmail = true } = req.body as { verified?: boolean; sendEmail?: boolean };
    if (typeof verified !== "boolean") {
      return res.status(400).json({ error: "Field verified (boolean) wajib diisi" });
    }

    const userId = req.params.userId;

    const { data: profile, error: profileErr } = await db
      .from("technician_profiles")
      .select("*, users!technician_profiles_user_id_fkey(email, full_name)")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr || !profile) {
      return res.status(404).json({ error: "Profil tukang tidak ditemukan" });
    }

    const { data: updated, error } = await db
      .from("technician_profiles")
      .update({ verified, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .select(
        "user_id, phone, area, nik, ktp_photo_url, selfie_photo_url, keahlian, verified, created_at, users!technician_profiles_user_id_fkey(id, email, full_name, created_at)"
      )
      .single();

    if (error) throw error;

    let devDashboardLink: string | undefined;
    if (verified && sendEmail) {
      const user = profile.users as { email: string; full_name: string | null } | null;
      if (user?.email) {
        try {
          devDashboardLink = await sendTechnicianVerifiedEmail(user.email, user.full_name);
        } catch (e) {
          console.error("Verification email failed:", e);
        }
      }
    }

    res.json({
      technician: formatTechnician(updated as Parameters<typeof formatTechnician>[0]),
      devDashboardLink,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memperbarui verifikasi" });
  }
});

function formatUser(row: {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  email_verified: boolean;
  created_at: string;
}) {
  return {
    userId: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    emailVerified: row.email_verified,
    memberSince: row.created_at,
  };
}

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = (req.query.filter as string) ?? "unverified_email";

    let query = db
      .from("users")
      .select("id, email, full_name, role, email_verified, created_at")
      .order("created_at", { ascending: false });

    if (filter === "unverified_email") {
      query = query.eq("email_verified", false);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      users: (data ?? []).map((row) => formatUser(row as Parameters<typeof formatUser>[0])),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat daftar pengguna" });
  }
});

router.patch("/users/:userId/email-verified", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { verified = true } = req.body as { verified?: boolean };
    if (typeof verified !== "boolean") {
      return res.status(400).json({ error: "Field verified (boolean) wajib diisi" });
    }

    const userId = req.params.userId;
    const { data: updated, error } = await db
      .from("users")
      .update({ email_verified: verified })
      .eq("id", userId)
      .select("id, email, full_name, role, email_verified, created_at")
      .single();

    if (error || !updated) {
      return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    }

    res.json({ user: formatUser(updated as Parameters<typeof formatUser>[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memperbarui verifikasi email" });
  }
});

router.get("/settings", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const settings = await getAppSettings();
    res.json({ settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat pengaturan" });
  }
});

router.patch("/settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { requireVerifiedToQuote, maintenanceMode } = req.body as {
      requireVerifiedToQuote?: boolean;
      maintenanceMode?: boolean;
    };

    const settings = await updateAppSettings({
      ...(typeof requireVerifiedToQuote === "boolean" ? { requireVerifiedToQuote } : {}),
      ...(typeof maintenanceMode === "boolean" ? { maintenanceMode } : {}),
    });

    res.json({ settings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan pengaturan" });
  }
});

export default router;
