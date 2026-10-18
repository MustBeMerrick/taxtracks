import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { setChallenge } from "@/lib/auth/challenge";
import { getCredentials, RP_ID } from "@/lib/auth/webauthn";

export async function POST() {
  const credentials = getCredentials();
  if (credentials.length === 0) {
    return NextResponse.json({ error: "No passkey registered" }, { status: 400 });
  }

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: credentials.map((credential) => ({
      id: credential.id,
      transports: credential.transports,
    })),
    userVerification: "required",
  });

  await setChallenge(options.challenge);
  return NextResponse.json(options);
}
