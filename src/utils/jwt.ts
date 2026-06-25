import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config.js";

export type TokenPayload = { sub: string; email: string; role: string };

export function signAccessToken(payload: TokenPayload) {
  return jwt.sign(payload, config.jwtAccessSecret, { expiresIn: "15m" });
}

export function signRefreshToken(payload: TokenPayload) {
  return jwt.sign(payload, config.jwtRefreshSecret, { expiresIn: "30d" });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtAccessSecret) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwtRefreshSecret) as TokenPayload;
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
