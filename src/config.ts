import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

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

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function parseOrigins(frontendUrl: string): string[] {
  const extra = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => normalizeUrl(o))
    .filter(Boolean);
  return [...new Set([frontendUrl, ...extra])];
}

const frontendUrl = requireUrl(process.env.FRONTEND_URL, "FRONTEND_URL", "http://localhost:5173");
const apiPublicUrl = requireUrl(
  process.env.API_PUBLIC_URL ?? process.env.BACKEND_URL,
  "API_PUBLIC_URL",
  "http://localhost:3000",
);

if (isProduction) {
  for (const [name, url] of [
    ["FRONTEND_URL", frontendUrl],
    ["API_PUBLIC_URL", apiPublicUrl],
    ["GOOGLE_REDIRECT_URI", process.env.GOOGLE_REDIRECT_URI ?? `${apiPublicUrl}/auth/google/callback`],
    ["FACEBOOK_REDIRECT_URI", process.env.FACEBOOK_REDIRECT_URI ?? `${apiPublicUrl}/auth/facebook/callback`],
  ] as const) {
    if (url.includes("localhost") || url.includes("127.0.0.1")) {
      throw new Error(`${name} must not use localhost in production (got ${url})`);
    }
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
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI?.trim() ||
      `${apiPublicUrl}/auth/google/callback`,
  },
  facebook: {
    appId: process.env.FACEBOOK_APP_ID ?? "",
    appSecret: process.env.FACEBOOK_APP_SECRET ?? "",
    redirectUri:
      process.env.FACEBOOK_REDIRECT_URI?.trim() ||
      `${apiPublicUrl}/auth/facebook/callback`,
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
};

if (isProduction) {
  console.log(`KerjaIn config: frontend=${config.frontendUrl} api=${config.apiPublicUrl}`);
}
