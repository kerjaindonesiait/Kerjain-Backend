import type { UserRow } from "../db.js";
import { getTechnicianOnboardingComplete } from "./technicianProfile.js";

export function basePublicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    avatarUrl: user.avatar_url,
    emailVerified: user.email_verified,
    phone: user.phone ?? null,
    createdAt: user.created_at,
  };
}

export async function enrichPublicUser(user: UserRow) {
  const base = basePublicUser(user);
  if (user.role !== "technician") return base;
  return {
    ...base,
    technicianOnboardingComplete: await getTechnicianOnboardingComplete(user.id),
  };
}
