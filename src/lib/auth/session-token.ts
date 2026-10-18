// Pure, cookie-store-free session token helpers. Kept separate from session.ts
// so proxy.ts (which gets a NextRequest, not the next/headers cookie API) can
// validate a session without touching next/headers.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "tt_session";
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  const value = process.env.AUTH_SESSION_SECRET;
  if (!value) throw new Error("AUTH_SESSION_SECRET is not set");
  return value;
}

function sign(expiresAt: number): string {
  return createHmac("sha256", secret()).update(`session.${expiresAt}`).digest("base64url");
}

export function createSessionToken(): { token: string; expiresAt: Date } {
  const expiresAtMs = Date.now() + SESSION_DURATION_MS;
  return { token: `${expiresAtMs}.${sign(expiresAtMs)}`, expiresAt: new Date(expiresAtMs) };
}

export function isValidSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = Buffer.from(sign(expiresAt));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
