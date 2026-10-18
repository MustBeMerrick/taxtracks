import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { isLockedOut, recordFailedAttempt, clearAttempts } from "@/lib/auth/rate-limit";

export async function POST(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";

  if (isLockedOut(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 }
    );
  }

  const storedHash = process.env.AUTH_PASSWORD_HASH;
  if (!storedHash) {
    return NextResponse.json({ error: "Password login is not configured" }, { status: 500 });
  }

  const { password } = (await request.json()) as { password?: string };
  if (!password || !verifyPassword(password, storedHash)) {
    recordFailedAttempt(ip);
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  clearAttempts(ip);
  await createSession();
  return NextResponse.json({ verified: true });
}
