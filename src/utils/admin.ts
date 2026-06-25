import { config } from "../config.js";

export function isAdminEmail(email: string): boolean {
  return config.adminEmails.includes(email.trim().toLowerCase());
}
