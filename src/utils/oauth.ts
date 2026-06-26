import { db, type UserRow } from "../db.js";
import { hashToken, signAccessToken, signRefreshToken } from "./jwt.js";
import { sendWelcomeEmail } from "./authTokens.js";

export type OAuthProvider = "google" | "facebook";

export interface OAuthProfile {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
}

export async function findOrCreateOAuthUser(
  profile: OAuthProfile,
  opts?: { role?: "user" | "technician" },
): Promise<UserRow> {
  const intendedRole = opts?.role ?? "user";

  async function applyTechnicianRole(user: UserRow): Promise<UserRow> {
    if (intendedRole === "technician" && user.role !== "technician") {
      const { data, error } = await db
        .from("users")
        .update({ role: "technician" })
        .eq("id", user.id)
        .select()
        .single();
      if (error) throw error;
      return data as UserRow;
    }
    return user;
  }
  const { data: existingOAuth } = await db
    .from("oauth_accounts")
    .select("user_id")
    .eq("provider", profile.provider)
    .eq("provider_user_id", profile.providerUserId)
    .maybeSingle();

  if (existingOAuth) {
    const { data } = await db.from("users").select("*").eq("id", existingOAuth.user_id).single();
    if (!data) throw new Error("Linked user not found");
    return applyTechnicianRole(data as UserRow);
  }

  const { data: existingUser } = await db
    .from("users")
    .select("*")
    .eq("email", profile.email)
    .maybeSingle();

  if (existingUser) {
    await db.from("oauth_accounts").insert({
      user_id: existingUser.id,
      provider: profile.provider,
      provider_user_id: profile.providerUserId,
      provider_email: profile.email,
    });
    if (!existingUser.email_verified) {
      await db.from("users").update({ email_verified: true }).eq("id", existingUser.id);
      existingUser.email_verified = true;
    }
    return applyTechnicianRole(existingUser as UserRow);
  }

  const { data: newUser, error } = await db
    .from("users")
    .insert({
      email: profile.email,
      full_name: profile.fullName,
      avatar_url: profile.avatarUrl,
      role: intendedRole === "technician" ? "technician" : "user",
      email_verified: true,
    })
    .select()
    .single();

  if (error) throw error;

  await db.from("oauth_accounts").insert({
    user_id: newUser.id,
    provider: profile.provider,
    provider_user_id: profile.providerUserId,
    provider_email: profile.email,
  });

  try {
    await sendWelcomeEmail(newUser.email, newUser.full_name);
  } catch (e) {
    console.error("Welcome email failed:", e);
  }

  return newUser as UserRow;
}

export async function issueTokens(user: UserRow) {
  const payload = { sub: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await db.from("refresh_tokens").insert({
    user_id: user.id,
    token_hash: hashToken(refreshToken),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      avatarUrl: user.avatar_url,
      emailVerified: user.email_verified,
      phone: user.phone ?? null,
      phoneVerified: user.phone_verified ?? false,
      createdAt: user.created_at,
    },
  };
}
