import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { createSession } from "@/lib/auth/session";
import { takeChallenge } from "@/lib/auth/challenge";
import { getCredential, ORIGIN, RP_ID, updateCredentialCounter } from "@/lib/auth/webauthn";

export async function POST(request: Request) {
  const expectedChallenge = await takeChallenge();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "No pending login" }, { status: 400 });
  }

  const response = (await request.json()) as AuthenticationResponseJSON;
  const credential = getCredential(response.id);
  if (!credential) {
    return NextResponse.json({ error: "Unknown credential" }, { status: 400 });
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
    },
  });

  if (!verification.verified) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  updateCredentialCounter(credential.id, verification.authenticationInfo.newCounter);
  await createSession();

  return NextResponse.json({ verified: true });
}
