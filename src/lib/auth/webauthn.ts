import "server-only";
import { getDb } from "@/lib/data";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";

// Passkeys are bound to the hostname in APP_URL (deploy/env), e.g. taxtracks.mustbemerrick.com.
// Other origins (Tailscale, LAN) still work with the password.
const APP_URL = new URL(process.env.APP_URL ?? "http://localhost:3005");
export const RP_ID = APP_URL.hostname;
export const RP_NAME = "Tax Tracks";
export const ORIGIN = APP_URL.origin;

// Single-user app: one fixed identity for WebAuthn's user handle.
export const USER_ID = new Uint8Array(Buffer.from("taxtracks-owner"));
export const USER_NAME = "marc";

export interface StoredCredential {
  id: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports: AuthenticatorTransportFuture[] | undefined;
}

function rowToCredential(row: {
  id: string;
  public_key: string;
  counter: number;
  transports: string | null;
}): StoredCredential {
  return {
    id: row.id,
    publicKey: Uint8Array.from(Buffer.from(row.public_key, "base64url")),
    counter: row.counter,
    transports: row.transports
      ? (JSON.parse(row.transports) as AuthenticatorTransportFuture[])
      : undefined,
  };
}

export function getCredentials(): StoredCredential[] {
  const rows = getDb()
    .prepare("SELECT id, public_key, counter, transports FROM passkey_credentials")
    .all() as { id: string; public_key: string; counter: number; transports: string | null }[];
  return rows.map(rowToCredential);
}

export function getCredential(id: string): StoredCredential | undefined {
  const row = getDb()
    .prepare("SELECT id, public_key, counter, transports FROM passkey_credentials WHERE id = ?")
    .get(id) as { id: string; public_key: string; counter: number; transports: string | null } | undefined;
  return row ? rowToCredential(row) : undefined;
}

export interface CredentialSummary {
  id: string;
  label: string | null;
  createdAt: string;
}

export function listCredentials(): CredentialSummary[] {
  const rows = getDb()
    .prepare("SELECT id, label, created_at FROM passkey_credentials ORDER BY created_at ASC")
    .all() as { id: string; label: string | null; created_at: string }[];
  return rows.map((row) => ({ id: row.id, label: row.label, createdAt: row.created_at }));
}

export function saveCredential(credential: StoredCredential, label?: string | null): void {
  getDb()
    .prepare(
    "INSERT INTO passkey_credentials (id, public_key, counter, transports, label) VALUES (?, ?, ?, ?, ?)"
  ).run(
    credential.id,
    Buffer.from(credential.publicKey).toString("base64url"),
    credential.counter,
    credential.transports ? JSON.stringify(credential.transports) : null,
    label || null
  );
}

export function updateCredentialCounter(id: string, counter: number): void {
  getDb()
    .prepare("UPDATE passkey_credentials SET counter = ? WHERE id = ?").run(counter, id);
}

export function deleteCredential(id: string): void {
  getDb()
    .prepare("DELETE FROM passkey_credentials WHERE id = ?").run(id);
}
