import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Base .env (local dev). Production host can set vars directly or use .env.production.
dotenv.config({ path: path.join(projectRoot, ".env") });
if (process.env.NODE_ENV === "production") {
  dotenv.config({ path: path.join(projectRoot, ".env.production"), override: true });
}

const isProduction = process.env.NODE_ENV === "production";

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function requireUrl(envValue: string | undefined, name: string, devFallback: string): string {
  if (envValue?.trim()) return normalizeUrl(envValue);
  if (!isProduction) return devFallback;
  throw new Error(
    `Missing ${name} in production. Set it on your host or in .env.production (see .env.production.example).`,
  );
}

function optionalUrl(envValue: string | undefined, devFallback = ""): string {
  if (envValue?.trim()) return normalizeUrl(envValue);
  if (!isProduction) return devFallback;
  return "";
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function pairedWwwOrigin(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.hostname.startsWith("www.")) {
      return `${u.protocol}//${u.hostname.slice(4)}`;
    }
    return `${u.protocol}//www.${u.hostname}`;
  } catch {
    return null;
  }
}

function parseOrigins(frontendUrl: string): string[] {
  const extra = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => normalizeUrl(o))
    .filter(Boolean);
  const paired = pairedWwwOrigin(frontendUrl);
  return [...new Set([frontendUrl, ...(paired ? [paired] : []), ...extra])];
}

const frontendUrl = requireUrl(process.env.FRONTEND_URL, "FRONTEND_URL", "http://localhost:5173");
const apiPublicUrl = optionalUrl(
  process.env.API_PUBLIC_URL ?? process.env.BACKEND_URL,
  "http://localhost:3000",
);
const googleClientId = process.env.GOOGLE_CLIENT_ID ?? "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
const facebookAppId = process.env.FACEBOOK_APP_ID ?? "";
const facebookAppSecret = process.env.FACEBOOK_APP_SECRET ?? "";
const explicitGoogleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
const explicitFacebookRedirectUri = process.env.FACEBOOK_REDIRECT_URI;
const googleRedirectUri = explicitGoogleRedirectUri?.trim()
  ? normalizeUrl(explicitGoogleRedirectUri)
  : apiPublicUrl
    ? `${apiPublicUrl}/auth/google/callback`
    : "";
const facebookRedirectUri = explicitFacebookRedirectUri?.trim()
  ? normalizeUrl(explicitFacebookRedirectUri)
  : apiPublicUrl
    ? `${apiPublicUrl}/auth/facebook/callback`
    : "";

if (isProduction) {
  for (const [name, url] of [
    ["FRONTEND_URL", frontendUrl],
    ["API_PUBLIC_URL", apiPublicUrl],
    ["GOOGLE_REDIRECT_URI", googleRedirectUri],
    ["FACEBOOK_REDIRECT_URI", facebookRedirectUri],
  ] as const) {
    if (url && (url.includes("localhost") || url.includes("127.0.0.1"))) {
      throw new Error(`${name} must not use localhost in production (got ${url})`);
    }
  }
  if (googleClientId && googleClientSecret && !googleRedirectUri) {
    throw new Error("Missing GOOGLE_REDIRECT_URI or API_PUBLIC_URL in production while Google OAuth is configured");
  }
  if (facebookAppId && facebookAppSecret && !facebookRedirectUri) {
    throw new Error("Missing FACEBOOK_REDIRECT_URI or API_PUBLIC_URL in production while Facebook OAuth is configured");
  }
}

export const config = {
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  frontendUrl,
  apiPublicUrl,
  corsOrigins: parseOrigins(frontendUrl),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  google: {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    redirectUri: googleRedirectUri,
  },
  facebook: {
    appId: facebookAppId,
    appSecret: facebookAppSecret,
    redirectUri: facebookRedirectUri,
  },
  email: {
    from: process.env.EMAIL_FROM ?? "KerjaIn <onboarding@resend.dev>",
    resendApiKey: process.env.RESEND_API_KEY ?? "",
  },
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  cookieSecure: process.env.COOKIE_SECURE === "true" || isProduction,
  midtrans: {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "",
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
};

if (isProduction) {
  console.log(`KerjaIn config: frontend=${config.frontendUrl} api=${config.apiPublicUrl}`);
}
