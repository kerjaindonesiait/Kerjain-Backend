import type { Response, Request } from "express";
import { config } from "../config.js";

export const ACCESS_COOKIE = "kerjain_access";
export const REFRESH_COOKIE = "kerjain_refresh";

const ACCESS_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_MAX_AGE_MS));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_MAX_AGE_MS));
}

export function setAccessCookie(res: Response, accessToken: string) {
  res.cookie(ACCESS_COOKIE, accessToken, cookieOptions(ACCESS_MAX_AGE_MS));
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { path: "/", sameSite: "lax", secure: config.cookieSecure });
  res.clearCookie(REFRESH_COOKIE, { path: "/", sameSite: "lax", secure: config.cookieSecure });
}

export function getAccessTokenFromRequest(req: Request): string | null {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (typeof fromCookie === "string" && fromCookie) return fromCookie;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);

  return null;
}

export function getRefreshTokenFromRequest(req: Request): string | null {
  const fromCookie = req.cookies?.[REFRESH_COOKIE];
  if (typeof fromCookie === "string" && fromCookie) return fromCookie;
  return null;
}

export function oauthCallbackUrl(next?: string) {
  const redirect = new URL("/auth/callback", config.frontendUrl);
  redirect.searchParams.set("oauth", "success");
  if (next) redirect.searchParams.set("next", next);
  return redirect.toString();
}
