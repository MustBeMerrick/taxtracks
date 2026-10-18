import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

/*
 * SQLite via Node's built-in node:sqlite (same approach as option-pilot-app).
 *
 * Each domain table stores the full record as JSON in `data`, with the
 * columns we filter on (tax_year) pulled out and indexed. That keeps the
 * schema stable while the domain model is still growing; promote a field to
 * a real column when a query needs it.
 *
 * Migrations are numbered and tracked in PRAGMA user_version. Append a new
 * entry to MIGRATIONS for any schema change; never edit a shipped one.
 */

export const DATA_DIR = path.join(process.cwd(), 'data')
export const DB_PATH = path.join(DATA_DIR, 'taxtracks.db')

/** Domain tables, in export/import order. */
export const DATA_TABLES = [
  'households',
  'taxpayers',
  'taxYears',
  'incomeSources',
  'payroll',
  'investmentSummaries',
  'investmentTransactions',
  'otherIncome',
  'liabilities',
  'withholdingElections',
  'taxPayments',
  'deductions',
  'carryovers',
  'assumptions',
  'calculationRuns',
  'auditEvents',
  'activity',
] as const

export type DataTable = (typeof DATA_TABLES)[number]

/** camelCase table name → snake_case SQL identifier. Only ever called with DATA_TABLES members. */
export const sqlTable = (table: DataTable) => table.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

const MIGRATIONS: ((db: DatabaseSync) => void)[] = [
  // 1: domain tables, bookkeeping, passkeys
  (db) => {
    for (const table of DATA_TABLES) {
      const name = sqlTable(table)
      db.exec(`
        CREATE TABLE ${name} (
          id TEXT PRIMARY KEY,
          tax_year INTEGER,
          data TEXT NOT NULL CHECK (json_valid(data)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX ${name}_tax_year ON ${name} (tax_year);
      `)
    }
    db.exec(`
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE passkey_credentials (
        id TEXT PRIMARY KEY,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL,
        transports TEXT,
        label TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
  },
]

export const SCHEMA_VERSION = MIGRATIONS.length

const userVersion = (db: DatabaseSync) => (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version

export function migrate(db: DatabaseSync): void {
  for (let version = userVersion(db); version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      // Re-check under the write lock: another process may have just migrated.
      if (userVersion(db) > version) return
      MIGRATIONS[version](db)
      db.exec(`PRAGMA user_version = ${version + 1}`)
    })
  }
}

/**
 * Runs fn inside a transaction, rolling back on any error. IMMEDIATE takes the
 * write lock up front so concurrent writers wait (busy_timeout) instead of
 * failing with SQLITE_BUSY when a read transaction tries to upgrade.
 */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function openDb(file: string = DB_PATH): DatabaseSync {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  // Owner-only: the file holds tax data. SQLite gives -wal/-shm the main file's
  // permissions, so chmodding on every open keeps all three at 600.
  if (file !== ':memory:') {
    try {
      fs.chmodSync(file, 0o600)
    } catch {
      // Best effort; a read-only mount shouldn't stop startup.
    }
  }
  // busy_timeout before journal_mode: switching to WAL needs the exclusive lock.
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}
