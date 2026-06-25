import { db } from "../db.js";
import { generateToken, hashToken, sendAuthEmail } from "./email.js";
import { config } from "../config.js";

const VERIFY_HOURS = 24;
const RESET_HOURS = 1;

async function storeToken(userId: string, type: "email_verify" | "password_reset") {
  const raw = generateToken();
  const tokenHash = hashToken(raw);
  const hours = type === "email_verify" ? VERIFY_HOURS : RESET_HOURS;

  await db.from("auth_tokens").delete().eq("user_id", userId).eq("type", type).is("used_at", null);

  await db.from("auth_tokens").insert({
    user_id: userId,
    type,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
  });

  return raw;
}

export async function sendWelcomeEmail(email: string, fullName: string | null) {
  const sent = await sendAuthEmail({
    to: email,
    subject: "Selamat datang di KerjaIn!",
    body: `Halo${fullName ? ` ${fullName}` : ""}, akun Anda berhasil dibuat. Pasang pekerjaan, temukan tukang terpercaya, dan bayar dengan aman di Jakarta.`,
    actionUrl: `${config.frontendUrl}`,
    actionLabel: "Mulai di KerjaIn",
  });
  return sent ? undefined : `${config.frontendUrl}`;
}

export async function sendVerificationEmail(userId: string, email: string, fullName: string | null) {
  const token = await storeToken(userId, "email_verify");
  const url = `${config.frontendUrl}/verifikasi-email?token=${token}`;
  const sent = await sendAuthEmail({
    to: email,
    subject: "Verifikasi email KerjaIn",
    body: `Halo${fullName ? ` ${fullName}` : ""}, klik tautan berikut untuk memverifikasi email Anda.`,
    actionUrl: url,
    actionLabel: "Verifikasi email",
  });
  return sent ? undefined : url;
}

export async function sendPasswordResetEmail(userId: string, email: string) {
  const token = await storeToken(userId, "password_reset");
  const url = `${config.frontendUrl}/atur-ulang-sandi?token=${token}`;
  const sent = await sendAuthEmail({
    to: email,
    subject: "Atur ulang kata sandi KerjaIn",
    body: "Kami menerima permintaan untuk mengatur ulang kata sandi Anda. Tautan ini berlaku 1 jam.",
    actionUrl: url,
    actionLabel: "Atur ulang kata sandi",
  });
  return sent ? undefined : url;
}

export async function sendTechnicianVerifiedEmail(email: string, fullName: string | null) {
  const sent = await sendAuthEmail({
    to: email,
    subject: "Identitas tukang Anda terverifikasi — KerjaIn",
    body: `Halo${fullName ? ` ${fullName}` : ""}, identitas Anda telah diverifikasi oleh tim KerjaIn. Badge terverifikasi kini aktif di profil Anda dan Anda dapat mengajukan penawaran pekerjaan.`,
    actionUrl: `${config.frontendUrl}/dasbor-tukang`,
    actionLabel: "Buka dasbor tukang",
  });
  return sent ? undefined : `${config.frontendUrl}/dasbor-tukang`;
}

export async function consumeToken(raw: string, type: "email_verify" | "password_reset") {
  const tokenHash = hashToken(raw);
  const { data, error } = await db
    .from("auth_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .eq("type", type)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  await db.from("auth_tokens").update({ used_at: new Date().toISOString() }).eq("id", data.id);
  return data.user_id as string;
}
