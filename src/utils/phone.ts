import { db } from "../db.js";

/** Normalize to digits; Indonesian local 08… → 628… */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  return digits;
}

/** Same phone may exist on one customer + one technician; not twice within the same role. */
export async function resolveTechnicianPhone(
  raw: string,
  userId: string,
): Promise<{ phone: string } | { error: string }> {
  const phone = normalizePhone(raw);
  if (!phone) return { error: "Nomor telepon tidak valid" };

  const { data } = await db
    .from("technician_profiles")
    .select("user_id")
    .eq("phone", phone)
    .neq("user_id", userId)
    .maybeSingle();

  if (data) {
    return { error: "Nomor telepon ini sudah terdaftar untuk akun tukang lain" };
  }
  return { phone };
}

export async function resolveCustomerPhone(
  raw: string,
  userId: string,
): Promise<{ phone: string } | { error: string }> {
  const phone = normalizePhone(raw);
  if (!phone) return { error: "Nomor telepon tidak valid" };

  const { data } = await db
    .from("users")
    .select("id")
    .eq("role", "user")
    .eq("phone", phone)
    .neq("id", userId)
    .maybeSingle();

  if (data) {
    return { error: "Nomor telepon ini sudah terdaftar untuk akun pelanggan lain" };
  }
  return { phone };
}
