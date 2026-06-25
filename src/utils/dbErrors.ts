/** Map Supabase / network failures to a user-facing API error message. */
export function dbErrorMessage(err: unknown): string | null {
  const text = [
    err instanceof Error ? err.message : "",
    typeof err === "object" && err !== null && "details" in err ? String((err as { details?: string }).details) : "",
    typeof err === "object" && err !== null && "message" in err ? String((err as { message?: string }).message) : "",
  ].join(" ");

  if (/ENOTFOUND|fetch failed|ECONNREFUSED|ETIMEDOUT|network/i.test(text)) {
    return "Tidak dapat terhubung ke database. Periksa koneksi internet Anda dan pastikan proyek Supabase aktif, lalu restart API (npm run dev:api).";
  }
  return null;
}

export async function checkDbConnection(): Promise<{ ok: boolean; error?: string }> {
  const { db } = await import("../db.js");
  const { error } = await db.from("users").select("id").limit(1);
  if (error) {
    return { ok: false, error: dbErrorMessage(error) ?? "Database error" };
  }
  return { ok: true };
}
