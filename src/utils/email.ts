import crypto from "crypto";
import { config } from "../config.js";

export async function sendAuthEmail(opts: {
  to: string;
  subject: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
}) {
  const cta = opts.actionUrl
    ? `<p style="margin:24px 0"><a href="${opts.actionUrl}" style="background:#2E5090;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">${opts.actionLabel ?? "Buka tautan"}</a></p><p style="font-size:12px;color:#666">${opts.actionUrl}</p>`
    : "";

  if (config.email.resendApiKey) {
    const html = `<div style="font-family:sans-serif;max-width:480px"><p>${opts.body}</p>${cta}</div>`;
    const sent = await tryResend(opts.to, opts.subject, html, config.email.from);
    if (sent) {
      console.log(`Email sent to ${opts.to}: ${opts.subject}`);
      return true;
    }
    // Retry with Resend sandbox if custom domain isn't verified yet
    const fallbackFrom = "KerjaIn <onboarding@resend.dev>";
    if (config.email.from !== fallbackFrom) {
      const sandboxSent = await tryResend(opts.to, opts.subject, html, fallbackFrom);
      if (sandboxSent) {
        console.log(`Email sent via Resend sandbox to ${opts.to}: ${opts.subject}`);
        return true;
      }
    }
  }

  console.log("\n--- KerjaIn auth email (dev) ---");
  console.log(`To: ${opts.to}`);
  console.log(`Subject: ${opts.subject}`);
  console.log(opts.body);
  if (opts.actionUrl) console.log(`Link: ${opts.actionUrl}`);
  console.log("--------------------------------\n");
  return false;
}

async function tryResend(to: string, subject: string, html: string, from: string) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.email.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Resend error (from=${from}):`, err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend fetch failed:", err);
    return false;
  }
}

export function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
