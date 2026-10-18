import { NextResponse } from "next/server";
import { hasValidSession } from "@/lib/auth/session";
import { listCredentials } from "@/lib/auth/webauthn";

export async function GET() {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({ credentials: listCredentials() });
}
