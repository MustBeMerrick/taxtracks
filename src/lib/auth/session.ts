import "server-only";
import { cookies } from "next/headers";
import { createSessionToken, isValidSessionToken, SESSION_COOKIE_NAME } from "./session-token";

export async function createSession(): Promise<void> {
  const { token, expiresAt } = createSessionToken();
  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE_NAME);
}

export async function hasValidSession(): Promise<boolean> {
  // Matches proxy.ts: local `next dev` is unauthenticated.
  if (process.env.NODE_ENV === "development") return true;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return isValidSessionToken(token);
}

/**
 * Server actions are reachable by direct POST, so each one re-checks the
 * session even though proxy.ts already gates page requests.
 */
export async function requireSession(): Promise<void> {
  if (!(await hasValidSession())) throw new Error("Not authenticated");
}
