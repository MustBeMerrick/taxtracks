import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { hasValidSession } from "@/lib/auth/session";
import { takeChallenge } from "@/lib/auth/challenge";
import { ORIGIN, RP_ID, saveCredential } from "@/lib/auth/webauthn";

export async function POST(request: Request) {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const expectedChallenge = await takeChallenge();
  if (!expectedChallenge) {
    return NextResponse.json({ error: "No pending registration" }, { status: 400 });
  }

  const body = (await request.json()) as { label?: string } & RegistrationResponseJSON;
  const { label, ...response } = body;

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;
  saveCredential(
    {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports,
    },
    label?.trim()
  );

  return NextResponse.json({ verified: true });
}
