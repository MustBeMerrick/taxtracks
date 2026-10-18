// Minimal in-memory lockout for the password login route. Single-process,
// single-instance deployment (one Docker container on gmktec) so a module-level
// map is enough -- no shared store needed.
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const attemptsByKey = new Map<string, { count: number; lockedUntil: number }>();

export function isLockedOut(key: string): boolean {
  const entry = attemptsByKey.get(key);
  return entry != null && entry.lockedUntil > Date.now();
}

export function recordFailedAttempt(key: string): void {
  const entry = attemptsByKey.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  attemptsByKey.set(key, entry);
}

export function clearAttempts(key: string): void {
  attemptsByKey.delete(key);
}
