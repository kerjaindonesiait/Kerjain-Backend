import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { normalizePhone } from "./phone.js";
import { sendWhatsAppOtp } from "./whatsapp.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const VERIFIED_TTL_MS = 30 * 60 * 1000;
const MAX_SEND_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;

function generateOtpCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function countRecentOtpSends(phone: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from("phone_otp_challenges")
    .select("*", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", since);
  return count ?? 0;
}

export async function isPhoneRecentlyVerified(phone: string): Promise<boolean> {
  const since = new Date(Date.now() - VERIFIED_TTL_MS).toISOString();
  const { data } = await db
    .from("phone_otp_challenges")
    .select("id")
    .eq("phone", phone)
    .not("verified_at", "is", null)
    .gte("verified_at", since)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function sendPhoneOtp(
  rawPhone: string,
  userId?: string,
): Promise<{ ok: true; message: string; devCode?: string } | { ok: false; error: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "Nomor telepon tidak valid" };

  const recent = await countRecentOtpSends(phone);
  if (recent >= MAX_SEND_PER_HOUR) {
    return { ok: false, error: "Terlalu banyak permintaan OTP. Coba lagi nanti." };
  }

  const code = generateOtpCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  await db.from("phone_otp_challenges").insert({
    phone,
    user_id: userId ?? null,
    code_hash: codeHash,
    expires_at: expiresAt,
  });

  const sent = await sendWhatsAppOtp(phone, code);
  if (!sent.ok) return { ok: false, error: sent.error };

  return {
    ok: true,
    message: "Kode OTP dikirim ke WhatsApp Anda.",
    devCode: sent.devCode,
  };
}

export async function verifyPhoneOtp(
  rawPhone: string,
  code: string,
  userId?: string,
): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "Nomor telepon tidak valid" };
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Kode OTP harus 6 digit" };

  const { data: challenge } = await db
    .from("phone_otp_challenges")
    .select("*")
    .eq("phone", phone)
    .is("verified_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!challenge) {
    return { ok: false, error: "Kode OTP kedaluwarsa atau tidak ditemukan. Minta kode baru." };
  }

  if (challenge.attempt_count >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, error: "Terlalu banyak percobaan. Minta kode OTP baru." };
  }

  const valid = await bcrypt.compare(code, challenge.code_hash);
  if (!valid) {
    await db
      .from("phone_otp_challenges")
      .update({ attempt_count: challenge.attempt_count + 1 })
      .eq("id", challenge.id);
    return { ok: false, error: "Kode OTP salah" };
  }

  await db
    .from("phone_otp_challenges")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", challenge.id);

  if (userId) {
    const { data: user } = await db.from("users").select("role").eq("id", userId).single();
    if (user?.role === "user") {
      await db.from("users").update({ phone, phone_verified: true }).eq("id", userId);
    }
  }

  return { ok: true, phone };
}

export async function assertPhoneVerifiedForSave(rawPhone: string): Promise<{ phone: string } | { error: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: "Nomor telepon tidak valid" };
  const ok = await isPhoneRecentlyVerified(phone);
  if (!ok) return { error: "Nomor WhatsApp belum diverifikasi. Kirim dan masukkan kode OTP." };
  return { phone };
}
