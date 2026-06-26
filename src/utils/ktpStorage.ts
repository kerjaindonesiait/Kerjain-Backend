import { db } from "../db.js";

export const KTP_BUCKET = "ktp-documents";
const SIGNED_URL_SECONDS = 60 * 60;

export function isOwnedKtpPath(path: string, userId: string): boolean {
  return path.startsWith(`${userId}/`);
}

export async function signKtpPath(path: string | null | undefined): Promise<string | null> {
  if (!path?.trim()) return null;
  const { data, error } = await db.storage.from(KTP_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) {
    console.error("KTP signed URL error:", error);
    return null;
  }
  return data.signedUrl;
}
