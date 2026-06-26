import crypto from "crypto";
import { db } from "../db.js";
import { normalizePhone } from "./phone.js";
import { sendSms } from "./sms.js";

const OTP_MINUTES = 10;
const RESEND_COOLDOWN_SEC = 60;
const MAX_ATTEMPTS = 5;
const VERIFIED_WINDOW_MINUTES = 30;

function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function generateOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export async function sendPhoneOtp(rawPhone: string): Promise<{ ok: true; devOtp?: string } | { error: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: "Nomor telepon tidak valid" };

  const cooldownSince = new Date(Date.now() - RESEND_COOLDOWN_SEC * 1000).toISOString();
  const { data: recent } = await db
    .from("phone_verifications")
    .select("created_at")
    .eq("phone", phone)
    .gt("created_at", cooldownSince)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) {
    return { error: "Tunggu sebentar sebelum meminta kode baru" };
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_MINUTES * 60 * 1000).toISOString();

  const { error } = await db.from("phone_verifications").insert({
    phone,
    otp_hash: hashOtp(code),
    expires_at: expiresAt,
  });

  if (error) {
    console.error("phone_verifications insert:", error);
    return { error: "Gagal mengirim kode verifikasi" };
  }

  const body = `Kode verifikasi KerjaIn: ${code}. Berlaku ${OTP_MINUTES} menit. Jangan bagikan kode ini.`;
  const sent = await sendSms(phone, body);
  return sent ? { ok: true } : { ok: true, devOtp: code };
}

export async function verifyPhoneOtp(
  rawPhone: string,
  code: string,
): Promise<{ ok: true; phone: string } | { error: string }> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { error: "Nomor telepon tidak valid" };
  if (!/^\d{6}$/.test(code.trim())) return { error: "Kode harus 6 digit" };

  const { data: row, error } = await db
    .from("phone_verifications")
    .select("*")
    .eq("phone", phone)
    .is("verified_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !row) {
    return { error: "Kode tidak valid atau sudah kedaluwarsa" };
  }

  if (row.attempt_count >= MAX_ATTEMPTS) {
    return { error: "Terlalu banyak percobaan. Minta kode baru." };
  }

  if (row.otp_hash !== hashOtp(code.trim())) {
    await db
      .from("phone_verifications")
      .update({ attempt_count: row.attempt_count + 1 })
      .eq("id", row.id);
    return { error: "Kode salah" };
  }

  await db.from("phone_verifications").update({ verified_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true, phone };
}

/** Ensures this phone completed OTP verification recently (signup / profile update). */
export async function requireRecentPhoneVerification(rawPhone: string): Promise<string> {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new Error("Nomor telepon tidak valid");

  const since = new Date(Date.now() - VERIFIED_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { data } = await db
    .from("phone_verifications")
    .select("verified_at")
    .eq("phone", phone)
    .not("verified_at", "is", null)
    .gt("verified_at", since)
    .order("verified_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.verified_at) {
    throw new Error("Nomor HP belum diverifikasi. Selesaikan verifikasi OTP terlebih dahulu.");
  }
  return phone;
}
