import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { DATA_TABLES, SCHEMA_VERSION, sqlTable, transaction, type DataTable } from '@/lib/db'
import type {
  ActivityItem,
  AuditAction,
  AuditEvent,
  CalculationRun,
  Carryover,
  Deduction,
  ForecastAssumption,
  Household,
  IncomeSource,
  InvestmentSourceSummary,
  InvestmentTransaction,
  LiabilityEstimate,
  OtherIncome,
  PayrollRecord,
  RecordMeta,
  TaxPayment,
  TaxYear,
  Taxpayer,
  WithholdingElection,
} from '@/lib/core/types'
import { sampleTables } from '@/lib/fixtures/sample-2026'

/*
 * All reads and writes of tax data go through this class. It stamps record
 * metadata, writes the audit log and tracks when canonical data last changed
 * (for the stale-calculation indicator). Pure; takes the database handle so
 * tests can use an in-memory one.
 */

export interface TableRecords {
  households: Household
  taxpayers: Taxpayer
  taxYears: TaxYear
  incomeSources: IncomeSource
  payroll: PayrollRecord
  investmentSummaries: InvestmentSourceSummary
  investmentTransactions: InvestmentTransaction
  otherIncome: OtherIncome
  liabilities: LiabilityEstimate
  withholdingElections: WithholdingElection
  taxPayments: TaxPayment
  deductions: Deduction
  carryovers: Carryover
  assumptions: ForecastAssumption
  calculationRuns: CalculationRun
  auditEvents: AuditEvent
  activity: ActivityItem
}

export type NewRecord<K extends DataTable> = Omit<TableRecords[K], 'id' | 'createdAt' | 'updatedAt'> & Partial<RecordMeta>

export interface YearData {
  year: number
  taxpayers: Taxpayer[]
  payroll: PayrollRecord[]
  investments: InvestmentSourceSummary[]
  otherIncome: OtherIncome[]
  liabilities: LiabilityEstimate[]
  activity: ActivityItem[]
}

export interface ExportFile {
  app: 'taxtracks'
  schemaVersion: number
  exportedAt: string
  tables: Partial<Record<DataTable, unknown[]>>
}

const DATA_CHANGED_AT = 'dataChangedAt'
const ACTOR = 'owner'

/** Singular, human-readable names for the change log. */
const RECORD_LABELS: Record<DataTable, string> = {
  households: 'household',
  taxpayers: 'taxpayer',
  taxYears: 'tax year settings',
  incomeSources: 'income source',
  payroll: 'paycheck',
  investmentSummaries: 'investment summary',
  investmentTransactions: 'investment transaction',
  otherIncome: 'other income',
  liabilities: 'liability estimate',
  withholdingElections: 'withholding election',
  taxPayments: 'tax payment',
  deductions: 'deduction',
  carryovers: 'carryover',
  assumptions: 'assumption',
  calculationRuns: 'calculation',
  auditEvents: 'audit event',
  activity: 'activity item',
}

const nowIso = () => new Date().toISOString()

export class TaxDataRepository {
  constructor(readonly db: DatabaseSync) {}

  // ---- reads ----

  all<K extends DataTable>(table: K, taxYear?: number): TableRecords[K][] {
    const sql = `SELECT data FROM ${sqlTable(table)}${taxYear === undefined ? '' : ' WHERE tax_year = ?'} ORDER BY rowid`
    const rows = (taxYear === undefined ? this.db.prepare(sql).all() : this.db.prepare(sql).all(taxYear)) as { data: string }[]
    return rows.map((r) => JSON.parse(r.data) as TableRecords[K])
  }

  get<K extends DataTable>(table: K, id: string): TableRecords[K] | undefined {
    const row = this.db.prepare(`SELECT data FROM ${sqlTable(table)} WHERE id = ?`).get(id) as { data: string } | undefined
    return row ? (JSON.parse(row.data) as TableRecords[K]) : undefined
  }

  count(table: DataTable): number {
    return (this.db.prepare(`SELECT COUNT(*) AS n FROM ${sqlTable(table)}`).get() as { n: number }).n
  }

  yearData(year: number): YearData {
    return {
      year,
      taxpayers: this.all('taxpayers'),
      payroll: this.all('payroll', year).sort((a, b) => a.payDate.localeCompare(b.payDate)),
      investments: this.all('investmentSummaries', year),
      otherIncome: this.all('otherIncome', year),
      liabilities: this.all('liabilities', year),
      activity: this.all('activity'),
    }
  }

  taxYears(): TaxYear[] {
    return this.all('taxYears').sort((a, b) => a.year - b.year)
  }

  isSample(): boolean {
    return this.all('households').some((h) => h.isSample === true)
  }

  /** When canonical data last changed; compared with the latest run to flag stale results. */
  dataChangedAt(): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(DATA_CHANGED_AT) as { value: string } | undefined
    return row?.value ?? null
  }

  latestRun(year: number): CalculationRun | undefined {
    return this.all('calculationRuns', year)
      .sort((a, b) => a.ranAt.localeCompare(b.ranAt))
      .at(-1)
  }

  recentAudit(limit = 15): AuditEvent[] {
    return this.all('auditEvents')
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit)
  }

  // ---- writes ----

  /** Seeds sample data into an empty database. Returns true if it seeded. */
  ensureSeeded(): boolean {
    return transaction(this.db, () => {
      if (this.count('households') > 0) return false
      this.writeTables(sampleTables())
      this.markChanged()
      return true
    })
  }

  /** Inserts or updates a record, stamping metadata and the audit log. */
  put<K extends DataTable>(table: K, record: NewRecord<K>): TableRecords[K] {
    return transaction(this.db, () => {
      const existed = record.id !== undefined && this.get(table, record.id) !== undefined
      const saved = this.upsert(table, record)
      this.audit(existed ? 'update' : 'create', table, saved.id, `${existed ? 'Updated' : 'Added'} ${RECORD_LABELS[table]}`)
      this.markChanged()
      return saved
    })
  }

  remove(table: DataTable, id: string): void {
    transaction(this.db, () => {
      this.db.prepare(`DELETE FROM ${sqlTable(table)} WHERE id = ?`).run(id)
      this.audit('delete', table, id, `Deleted ${RECORD_LABELS[table]}`)
      this.markChanged()
    })
  }

  /** Saves a calculation snapshot. Does not mark data as changed. */
  saveRun(run: NewRecord<'calculationRuns'>): CalculationRun {
    return transaction(this.db, () => {
      const saved = this.upsert('calculationRuns', run)
      this.audit('recalculate', 'calculationRuns', saved.id, `Recalculated ${run.taxYear}`)
      return saved
    })
  }

  exportAll(): ExportFile {
    const tables: ExportFile['tables'] = {}
    for (const name of DATA_TABLES) tables[name] = this.all(name)
    return { app: 'taxtracks', schemaVersion: SCHEMA_VERSION, exportedAt: nowIso(), tables }
  }

  /** Replaces all data with an export file's contents, atomically. */
  importAll(file: unknown): { records: number } {
    const parsed = parseExportFile(file)
    return transaction(this.db, () => {
      this.clearTables()
      const records = this.writeTables(parsed.tables)
      this.audit('import', 'all', undefined, `Restored ${records} records from a backup made ${parsed.exportedAt.slice(0, 10)}`)
      this.markChanged()
      return { records }
    })
  }

  /** Replaces all data with the bundled sample. */
  resetToSample(): void {
    transaction(this.db, () => {
      this.clearTables()
      this.writeTables(sampleTables())
      this.audit('reset', 'all', undefined, 'Reset to sample data')
      this.markChanged()
    })
  }

  /** Removes every record, leaving an empty household and tax year ready for real data. */
  clearAll(year = new Date().getFullYear()): void {
    transaction(this.db, () => {
      this.clearTables()
      this.upsert('households', { id: 'household', name: 'Household' })
      this.upsert('taxYears', { id: `ty-${year}`, householdId: 'household', year, filingStatus: 'mfj', jurisdictions: ['federal', 'ca'] })
      this.audit('reset', 'all', undefined, 'Cleared all data')
      this.markChanged()
    })
  }

  // ---- internals ----

  private upsert<K extends DataTable>(table: K, record: NewRecord<K>): TableRecords[K] {
    const stamp = nowIso()
    const id = record.id ?? randomUUID()
    const existing = this.get(table, id)
    const saved = { ...record, id, createdAt: existing?.createdAt ?? stamp, updatedAt: stamp } as TableRecords[K]
    this.writeRow(table, saved)
    return saved
  }

  private writeRow(table: DataTable, row: RecordMeta & { taxYear?: number }) {
    this.db
      .prepare(
        `INSERT INTO ${sqlTable(table)} (id, tax_year, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET tax_year = excluded.tax_year, data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(row.id, typeof row.taxYear === 'number' ? row.taxYear : null, JSON.stringify(row), row.createdAt, row.updatedAt)
  }

  private clearTables() {
    for (const name of DATA_TABLES) this.db.exec(`DELETE FROM ${sqlTable(name)}`)
  }

  private writeTables(tables: Partial<Record<DataTable, unknown[]>>): number {
    let count = 0
    for (const name of DATA_TABLES) {
      for (const row of tables[name] ?? []) {
        this.writeRow(name, row as RecordMeta)
        count++
      }
    }
    return count
  }

  private markChanged() {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(DATA_CHANGED_AT, nowIso())
  }

  private audit(action: AuditAction, entity: string, entityId: string | undefined, summary: string) {
    this.upsert('auditEvents', { at: nowIso(), actor: ACTOR, action, entity, entityId, summary })
  }
}

/** Validates an export file's envelope and row shapes. Throws with a readable message. */
export function parseExportFile(file: unknown): ExportFile {
  if (!isObject(file) || file.app !== 'taxtracks') throw new Error('Not a Tax Tracks export file.')
  if (typeof file.schemaVersion !== 'number' || file.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`Export uses schema version ${String(file.schemaVersion)}; this app supports up to ${SCHEMA_VERSION}.`)
  }
  if (!isObject(file.tables)) throw new Error('Export file has no tables.')
  const tables: ExportFile['tables'] = {}
  for (const [name, rows] of Object.entries(file.tables)) {
    if (!(DATA_TABLES as readonly string[]).includes(name)) throw new Error(`Unknown table "${name}" in export.`)
    if (!Array.isArray(rows)) throw new Error(`Table "${name}" is not a list.`)
    rows.forEach((row, i) => {
      if (!isObject(row) || typeof row.id !== 'string' || !row.id) throw new Error(`Row ${i + 1} in "${name}" has no id.`)
      if (typeof row.createdAt !== 'string' || typeof row.updatedAt !== 'string') throw new Error(`Row ${i + 1} in "${name}" is missing timestamps.`)
    })
    tables[name as DataTable] = rows
  }
  return { app: 'taxtracks', schemaVersion: file.schemaVersion, exportedAt: String(file.exportedAt ?? 'unknown date'), tables }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** SHA-256 of a value's JSON, for reproducibility checks on calculation runs. */
export function hashInputs(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
