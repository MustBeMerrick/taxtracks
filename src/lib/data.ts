import 'server-only'
import { cookies } from 'next/headers'
import type { DatabaseSync } from 'node:sqlite'
import { openDb } from '@/lib/db'
import { TaxDataRepository } from '@/lib/repository'

// Opened lazily on first use, not at import: `next build` evaluates route
// modules in parallel workers and must never open (or seed) the real database.
// One connection per server process, reused across dev hot reloads.
const globalForDb = globalThis as unknown as { taxtracksDb?: DatabaseSync; taxtracksRepo?: TaxDataRepository }

export function getDb(): DatabaseSync {
  globalForDb.taxtracksDb ??= openDb()
  return globalForDb.taxtracksDb
}

export function getRepository(): TaxDataRepository {
  if (!globalForDb.taxtracksRepo) {
    const repository = new TaxDataRepository(getDb())
    // First run on an empty database loads the demo household.
    repository.ensureSeeded()
    globalForDb.taxtracksRepo = repository
  }
  return globalForDb.taxtracksRepo
}

export const YEAR_COOKIE = 'tt_year'

/** The tax year being viewed: the cookie if it names a known year, else the latest year on file. */
export async function selectedYear(): Promise<number> {
  const years = getRepository()
    .taxYears()
    .map((t) => t.year)
  const fromCookie = Number((await cookies()).get(YEAR_COOKIE)?.value)
  if (years.includes(fromCookie)) return fromCookie
  return years.at(-1) ?? new Date().getFullYear()
}
