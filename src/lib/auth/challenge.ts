import "server-only";
import { cookies } from "next/headers";

// WebAuthn challenges are short-lived and only need to round-trip to the
// browser and back, so a signed-nothing httpOnly cookie is enough -- no DB
// row, no session-secret signing needed since the value itself is a random
// challenge, not a capability.
const COOKIE_NAME = "tt_webauthn_challenge";
const MAX_AGE_SECONDS = 5 * 60;

export async function setChallenge(challenge: string): Promise<void> {
  (await cookies()).set(COOKIE_NAME, challenge, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function takeChallenge(): Promise<string | undefined> {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  store.delete(COOKIE_NAME);
  return value;
}
