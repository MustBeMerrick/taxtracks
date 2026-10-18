import { NextResponse } from "next/server";
import { getCredentials } from "@/lib/auth/webauthn";

export async function GET() {
  return NextResponse.json({ hasPasskey: getCredentials().length > 0 });
}
