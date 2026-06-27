import { Router } from "express";
import { db } from "../db.js";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { resolveTechnicianPhone } from "../utils/phone.js";
import { isOwnedKtpPath, signKtpPath } from "../utils/ktpStorage.js";

const router = Router();

router.get("/me/stats", requireAuth, requireRole("technician"), async (req: AuthedRequest, res) => {
  try {
    const userId = req.user!.id;

    const { data: profile } = await db
      .from("technician_profiles")
      .select("rating, review_count, verified, area")
      .eq("user_id", userId)
      .maybeSingle();

    const { count: completedJobs } = await db
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("assigned_technician_id", userId)
      .eq("status", "completed");

    const { count: assignedJobs } = await db
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("assigned_technician_id", userId)
      .in("status", ["assigned", "in_progress", "completed"]);

    const { count: activeOffers } = await db
      .from("offers")
      .select("*", { count: "exact", head: true })
      .eq("technician_id", userId)
      .eq("status", "pending");

    const completionRate =
      assignedJobs && assignedJobs > 0
        ? Math.round(((completedJobs ?? 0) / assignedJobs) * 100)
        : null;

    res.json({
      stats: {
        rating: profile?.rating != null ? Number(profile.rating) : 0,
        reviewCount: profile?.review_count ?? 0,
        completedJobs: completedJobs ?? 0,
        completionRate,
        activeOffers: activeOffers ?? 0,
        verified: profile?.verified ?? false,
        area: profile?.area ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat statistik" });
  }
});

router.get("/:id/public", async (req, res) => {
  try {
    const { data: user, error: userErr } = await db
      .from("users")
      .select("id, full_name, avatar_url, created_at")
      .eq("id", req.params.id)
      .eq("role", "technician")
      .maybeSingle();

    if (userErr || !user) {
      return res.status(404).json({ error: "Tukang tidak ditemukan" });
    }

    const { data: profile } = await db
      .from("technician_profiles")
      .select("area, keahlian, pengalaman, tarif, bio, rating, review_count, verified")
      .eq("user_id", user.id)
      .maybeSingle();

    const { count: completedJobs } = await db
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("assigned_technician_id", user.id)
      .eq("status", "completed");

    const { count: assignedJobs } = await db
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("assigned_technician_id", user.id)
      .in("status", ["assigned", "in_progress", "completed"]);

    const completionRate =
      assignedJobs && assignedJobs > 0
        ? Math.round(((completedJobs ?? 0) / assignedJobs) * 100)
        : null;

    res.json({
      technician: {
        id: user.id,
        name: user.full_name ?? "Tukang",
        avatarUrl: user.avatar_url,
        memberSince: new Date(user.created_at).getFullYear().toString(),
        area: profile?.area ?? null,
        keahlian: profile?.keahlian ?? [],
        pengalaman: profile?.pengalaman ?? null,
        tarif: profile?.tarif ?? null,
        bio: profile?.bio ?? null,
        completedJobs: completedJobs ?? 0,
        completionRate,
        rating: profile?.rating != null ? Number(profile.rating) : 0,
        reviewCount: profile?.review_count ?? 0,
        verified: profile?.verified ?? false,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal memuat profil tukang" });
  }
});

router.get("/profile", requireAuth, requireRole("technician"), async (req: AuthedRequest, res) => {
  const { data, error } = await db
    .from("technician_profiles")
    .select("*")
    .eq("user_id", req.user!.id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: "Failed to fetch profile" });
  const p = data;
  const ktpPhotoUrl = p ? await signKtpPath(p.ktp_photo_url) : null;
  const selfiePhotoUrl = p ? await signKtpPath(p.selfie_photo_url) : null;
  res.json({
    profile: p
      ? {
          area: p.area,
          keahlian: p.keahlian ?? [],
          pengalaman: p.pengalaman,
          tarif: p.tarif,
          bio: p.bio,
          verified: p.verified ?? false,
          ktpPhotoUrl,
          selfiePhotoUrl,
          nik: p.nik,
        }
      : null,
  });
});

router.post("/profile", requireAuth, requireRole("technician"), async (req: AuthedRequest, res) => {
  try {
    const body = req.body;
    const userId = req.user!.id;
    let normalizedPhone: string | null = null;
    if (body.phone) {
      const resolved = await resolveTechnicianPhone(body.phone, userId);
      if ("error" in resolved) return res.status(409).json({ error: resolved.error });
      normalizedPhone = resolved.phone;
    }

    const ktpPath = body.ktpPhoto ?? body.ktp_photo_url ?? null;
    const selfiePath = body.selfiePhoto ?? body.selfie_photo_url ?? null;

    if (ktpPath && !isOwnedKtpPath(ktpPath, userId)) {
      return res.status(400).json({ error: "Path foto KTP tidak valid" });
    }
    if (selfiePath && !isOwnedKtpPath(selfiePath, userId)) {
      return res.status(400).json({ error: "Path foto selfie tidak valid" });
    }

    const payload = {
      user_id: userId,
      phone: normalizedPhone,
      area: body.area ?? null,
      nik: body.nik ?? null,
      ktp_photo_url: ktpPath,
      selfie_photo_url: selfiePath,
      keahlian: body.keahlian ?? [],
      pengalaman: body.pengalaman ?? null,
      tarif: body.tarif ?? null,
      bio: body.bio ?? null,
    };

    const { data: existing } = await db
      .from("technician_profiles")
      .select("id")
      .eq("user_id", req.user!.id)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await db
        .from("technician_profiles")
        .update(payload)
        .eq("user_id", req.user!.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await db.from("technician_profiles").insert(payload).select().single();
      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Nomor telepon ini sudah terdaftar untuk akun tukang lain" });
        }
        throw error;
      }
      result = data;
    }

    res.json({ profile: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save profile" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { email, password, fullName, ...profileData } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 12);

    const { data: user, error: userErr } = await db
      .from("users")
      .insert({ email, password_hash: passwordHash, full_name: fullName, role: "technician" })
      .select()
      .single();

    if (userErr) {
      if (userErr.code === "23505") return res.status(409).json({ error: "Email already registered" });
      throw userErr;
    }

    let normalizedPhone: string | null = null;
    if (profileData.phone) {
      const resolved = await resolveTechnicianPhone(profileData.phone, user.id);
      if ("error" in resolved) {
        await db.from("users").delete().eq("id", user.id);
        return res.status(409).json({ error: resolved.error });
      }
      normalizedPhone = resolved.phone;
    }

    const { data: profile, error: profileErr } = await db
      .from("technician_profiles")
      .insert({
        user_id: user.id,
        phone: normalizedPhone,
        area: profileData.area ?? null,
        keahlian: profileData.keahlian ?? [],
        pengalaman: profileData.pengalaman ?? null,
        tarif: profileData.tarif ?? null,
        bio: profileData.bio ?? null,
      })
      .select()
      .single();

    if (profileErr) {
      await db.from("users").delete().eq("id", user.id);
      if (profileErr.code === "23505") {
        return res.status(409).json({ error: "Nomor telepon ini sudah terdaftar untuk akun tukang lain" });
      }
      throw profileErr;
    }

    res.status(201).json({ user, profile });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Technician registration failed" });
  }
});

export default router;
