import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { isAdminEmail } from "../utils/admin.js";
import { getAccessTokenFromRequest } from "../utils/cookies.js";

export type AuthedRequest = Request & { user?: { id: string; email: string; role: string } };

function attachUser(req: AuthedRequest, token: string): boolean {
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    return true;
  } catch {
    return false;
  }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = getAccessTokenFromRequest(req);
  if (!token || !attachUser(req, token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export function optionalAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = getAccessTokenFromRequest(req);
  if (token) attachUser(req, token);
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  if (!isAdminEmail(req.user.email)) {
    return res.status(403).json({ error: "Akses admin ditolak" });
  }
  next();
}
