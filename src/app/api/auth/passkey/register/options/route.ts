import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { hasValidSession } from "@/lib/auth/session";
import { setChallenge } from "@/lib/auth/challenge";
import { getCredentials, RP_ID, RP_NAME, USER_ID, USER_NAME } from "@/lib/auth/webauthn";

// Registering a new passkey requires an existing session -- this is how a
// second device gets added later without ever needing another shared secret.
export async function POST() {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: USER_ID,
    userName: USER_NAME,
    attestationType: "none",
    excludeCredentials: getCredentials().map((credential) => ({
      id: credential.id,
      transports: credential.transports,
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required",
    },
  });

  await setChallenge(options.challenge);
  return NextResponse.json(options);
}
