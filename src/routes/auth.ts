import { Router } from "express";
import { db, type UserRow } from "../db.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { hashToken, signAccessToken, verifyRefreshToken } from "../utils/jwt.js";
import { findOrCreateOAuthUser, issueTokens } from "../utils/oauth.js";
import { consumeToken, sendPasswordResetEmail, sendVerificationEmail } from "../utils/authTokens.js";
import { resolveCustomerPhone } from "../utils/phone.js";
import { config } from "../config.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { clearAuthCookies, getRefreshTokenFromRequest, setAccessCookie, setAuthCookies } from "../utils/cookies.js";

const router = Router();

function publicUser(user: UserRow) {
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

function oauthRedirect(tokens: { accessToken: string; refreshToken: string }, next?: string) {
  const redirect = new URL("/auth/callback", config.frontendUrl);
  redirect.searchParams.set("access_token", tokens.accessToken);
  redirect.searchParams.set("refresh_token", tokens.refreshToken);
  if (next) redirect.searchParams.set("next", next);
  return redirect.toString();
}

function parseOAuthState(stateParam: string | undefined): { role: "user" | "technician" } {
  if (!stateParam) return { role: "user" };
  try {
    const parsed = JSON.parse(Buffer.from(stateParam, "base64url").toString("utf8"));
    return { role: parsed.role === "technician" ? "technician" : "user" };
  } catch {
    return { role: "user" };
  }
}

function encodeOAuthState(role: "user" | "technician") {
  return Buffer.from(JSON.stringify({ role }), "utf8").toString("base64url");
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, fullName, role = "user" } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }
    if (!["user", "technician"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const passwordHash = await hashPassword(password);
    const { data, error } = await db
      .from("users")
      .insert({
        email,
        password_hash: passwordHash,
        full_name: fullName ?? null,
        role,
        email_verified: false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return res.status(409).json({ error: "Email already registered" });
      throw error;
    }

    const user = data as UserRow;
    let devVerifyLink: string | undefined;
    try {
      devVerifyLink = await sendVerificationEmail(user.id, user.email, user.full_name);
    } catch (e) {
      console.error("Registration email failed:", e);
    }

    res.status(201).json({ ok: true, user: publicUser(user), devVerifyLink });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const { data, error } = await db.from("users").select("*").eq("email", email).single();
    if (error || !data?.password_hash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await verifyPassword(password, data.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    if (!data.email_verified) return res.status(403).json({ error: "Email belum terverifikasi" });

    const tokens = await issueTokens(data as UserRow);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    res.json({ user: tokens.user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });

    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);

    const { data: stored } = await db
      .from("refresh_tokens")
      .select("*")
      .eq("user_id", payload.sub)
      .eq("token_hash", tokenHash)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!stored) return res.status(401).json({ error: "Invalid refresh token" });

    const { data: user } = await db.from("users").select("*").eq("id", payload.sub).single();
    if (!user) return res.status(401).json({ error: "User not found" });

    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    setAccessCookie(res, accessToken);
    res.json({ user: publicUser(user as UserRow) });
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const { data, error } = await db.from("users").select("*").eq("id", req.user!.id).single();
  if (error || !data) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(data as UserRow) });
});

router.post("/logout", async (req, res) => {
  const refreshToken = getRefreshTokenFromRequest(req);
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await db
        .from("refresh_tokens")
        .delete()
        .eq("user_id", payload.sub)
        .eq("token_hash", hashToken(refreshToken));
    } catch {
      // Clear local cookies even if the refresh token is already invalid.
    }
  }
  clearAuthCookies(res);
  res.json({ ok: true });
});

// ─── Email verification ───────────────────────────────────────────────────────

router.post("/verify-email", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token required" });

    const userId = await consumeToken(token, "email_verify");
    if (!userId) return res.status(400).json({ error: "Tautan tidak valid atau sudah kedaluwarsa" });

    await db.from("users").update({ email_verified: true }).eq("id", userId);
    const { data: user } = await db.from("users").select("*").eq("id", userId).single();
    res.json({ ok: true, user: user ? publicUser(user as UserRow) : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/resend-verification", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data: user, error } = await db.from("users").select("*").eq("id", req.user!.id).single();
    if (error || !user) return res.status(404).json({ error: "User not found" });
    if (user.email_verified) return res.json({ ok: true, message: "Email sudah terverifikasi" });

    const devVerifyLink = await sendVerificationEmail(user.id, user.email, user.full_name);
    res.json({ ok: true, devVerifyLink });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengirim email verifikasi" });
  }
});

// ─── Password reset ───────────────────────────────────────────────────────────

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const { data: user } = await db.from("users").select("*").eq("email", email).maybeSingle();

    // Always return success to avoid email enumeration
    if (!user) {
      return res.json({ ok: true, message: "Jika email terdaftar, kami mengirim tautan atur ulang sandi." });
    }

    let devResetLink: string | undefined;
    try {
      devResetLink = await sendPasswordResetEmail(user.id, user.email);
    } catch (e) {
      console.error("Reset email failed:", e);
    }

    res.json({
      ok: true,
      message: "Jika email terdaftar, kami mengirim tautan atur ulang sandi.",
      devResetLink,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Request failed" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: "Token and password required" });
    if (password.length < 6) return res.status(400).json({ error: "Password minimal 6 karakter" });

    const userId = await consumeToken(token, "password_reset");
    if (!userId) return res.status(400).json({ error: "Tautan tidak valid atau sudah kedaluwarsa" });

    const passwordHash = await hashPassword(password);
    await db.from("users").update({ password_hash: passwordHash }).eq("id", userId);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Reset failed" });
  }
});

// ─── Profile ──────────────────────────────────────────────────────────────────

router.patch("/profile", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { fullName, avatarUrl, phone } = req.body;
    const updates: Record<string, string | null> = {};
    if (fullName !== undefined) updates.full_name = fullName || null;
    if (avatarUrl !== undefined) updates.avatar_url = avatarUrl || null;

    if (phone !== undefined) {
      if (req.user!.role !== "user") {
        return res.status(400).json({ error: "Nomor telepon pelanggan hanya untuk akun pengguna" });
      }
      if (!phone || !String(phone).trim()) {
        updates.phone = null;
      } else {
        const resolved = await resolveCustomerPhone(String(phone), req.user!.id);
        if ("error" in resolved) return res.status(409).json({ error: resolved.error });
        updates.phone = resolved.phone;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const { data, error } = await db
      .from("users")
      .update(updates)
      .eq("id", req.user!.id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Nomor telepon ini sudah terdaftar untuk akun pelanggan lain" });
      }
      throw error;
    }
    res.json({ user: publicUser(data as UserRow) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Update failed" });
  }
});

router.patch("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password required" });
    }
    if (newPassword.length < 6) return res.status(400).json({ error: "Password minimal 6 karakter" });

    const { data: user, error } = await db.from("users").select("*").eq("id", req.user!.id).single();
    if (error || !user?.password_hash) {
      return res.status(400).json({ error: "Akun OAuth tidak memakai kata sandi" });
    }

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Kata sandi saat ini salah" });

    const passwordHash = await hashPassword(newPassword);
    await db.from("users").update({ password_hash: passwordHash }).eq("id", user.id);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Change password failed" });
  }
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────

router.get("/google", (req, res) => {
  if (!config.google.clientId || !config.google.clientSecret) {
    return res.status(503).json({ error: "Google OAuth not configured" });
  }
  const role = req.query.role === "technician" ? "technician" : "user";
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
    state: encodeOAuthState(role),
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get("/google/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) return res.status(400).send("Missing code");

    const { role } = parseOAuthState(req.query.state as string | undefined);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.google.clientId,
        client_secret: config.google.clientSecret,
        redirect_uri: config.google.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.status(400).send("OAuth token exchange failed");

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    const user = await findOrCreateOAuthUser({
      provider: "google",
      providerUserId: String(profile.id),
      email: profile.email,
      fullName: profile.name ?? null,
      avatarUrl: profile.picture ?? null,
    }, { role });

    const tokens = await issueTokens(user);
    const next = role === "technician" ? "/daftar-tukang?resume=1&provider=google" : undefined;
    res.redirect(oauthRedirect(tokens, next));
  } catch (err) {
    console.error(err);
    res.redirect(`${config.frontendUrl}/masuk?error=oauth_failed`);
  }
});

// ─── Facebook OAuth ───────────────────────────────────────────────────────────

router.get("/facebook", (req, res) => {
  if (!config.facebook.appId || !config.facebook.appSecret) {
    return res.status(503).json({ error: "Facebook OAuth not configured" });
  }
  const role = req.query.role === "technician" ? "technician" : "user";
  const params = new URLSearchParams({
    client_id: config.facebook.appId,
    redirect_uri: config.facebook.redirectUri,
    scope: "email,public_profile",
    response_type: "code",
    state: encodeOAuthState(role),
  });
  res.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${params}`);
});

router.get("/facebook/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const error = req.query.error as string | undefined;

    if (error) {
      console.error("Facebook OAuth error:", error, req.query.error_description);
      return res.redirect(`${config.frontendUrl}/masuk?error=oauth_denied`);
    }
    if (!code) return res.status(400).send("Missing code");

    const { role } = parseOAuthState(req.query.state as string | undefined);

    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", config.facebook.appId);
    tokenUrl.searchParams.set("client_secret", config.facebook.appSecret);
    tokenUrl.searchParams.set("redirect_uri", config.facebook.redirectUri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("Facebook token error:", tokenData);
      return res.status(400).send("OAuth token exchange failed");
    }

    const profileUrl = new URL("https://graph.facebook.com/me");
    profileUrl.searchParams.set("fields", "id,name,email,picture.type(large)");
    profileUrl.searchParams.set("access_token", tokenData.access_token);

    const profileRes = await fetch(profileUrl.toString());
    const profile = await profileRes.json();

    if (!profile.id) {
      console.error("Facebook profile error:", profile);
      return res.status(400).send("Failed to fetch Facebook profile");
    }

    const email = profile.email as string | undefined;
    if (!email) {
      return res.redirect(`${config.frontendUrl}/masuk?error=facebook_no_email`);
    }

    const user = await findOrCreateOAuthUser({
      provider: "facebook",
      providerUserId: String(profile.id),
      email,
      fullName: profile.name ?? null,
      avatarUrl: profile.picture?.data?.url ?? null,
    }, { role });

    const tokens = await issueTokens(user);
    const next = role === "technician" ? "/daftar-tukang?resume=1&provider=facebook" : undefined;
    res.redirect(oauthRedirect(tokens, next));
  } catch (err) {
    console.error(err);
    res.redirect(`${config.frontendUrl}/masuk?error=oauth_failed`);
  }
});

export default router;
