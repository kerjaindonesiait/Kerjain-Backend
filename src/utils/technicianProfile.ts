import { db } from "../db.js";

type TechnicianProfileRow = {
  phone: string | null;
  area: string | null;
  nik: string | null;
  ktp_photo_url: string | null;
  selfie_photo_url: string | null;
  keahlian: string[] | null;
  pengalaman: string | null;
};

export function isTechnicianProfileComplete(profile: TechnicianProfileRow | null | undefined): boolean {
  if (!profile) return false;
  const keahlian = profile.keahlian ?? [];
  return !!(
    profile.phone &&
    profile.area &&
    profile.nik &&
    profile.ktp_photo_url &&
    profile.selfie_photo_url &&
    keahlian.length >= 1 &&
    profile.pengalaman
  );
}

export async function getTechnicianOnboardingComplete(userId: string): Promise<boolean> {
  const { data: profile } = await db
    .from("technician_profiles")
    .select("phone, area, nik, ktp_photo_url, selfie_photo_url, keahlian, pengalaman")
    .eq("user_id", userId)
    .maybeSingle();

  return isTechnicianProfileComplete(profile as TechnicianProfileRow | null);
}
