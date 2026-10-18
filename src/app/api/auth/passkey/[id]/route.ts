import { NextResponse } from "next/server";
import { hasValidSession } from "@/lib/auth/session";
import { deleteCredential } from "@/lib/auth/webauthn";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  deleteCredential(id);

  return NextResponse.json({ ok: true });
}
