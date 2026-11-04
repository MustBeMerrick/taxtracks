/*
 * One-off data fix (Nov 2026): Mae's 2026 ADP paystubs were entered with three lines misclassified.
 *   "401K $$$$"       entered as HSA            → traditional 401(k)       (benefits.hsa → benefits.retirement401k)
 *   "401K Er Match"   entered as employer HSA   → removed (an employer 401(k) match is not taxable wages)
 *   Hospital indemnity entered as pre-tax       → after-tax                (benefits → afterTax, out of preTax)
 * Each paycheck keeps its own amounts; gross, every withholding line and net pay are unchanged.
 *
 *   node scripts/reclassify-mae-paystubs-2026.ts <db>            dry run: shows what would change, writes nothing
 *   node scripts/reclassify-mae-paystubs-2026.ts <db> --apply    backs up the db, applies in one transaction, reconciles
 *
 * Idempotent: a reclassified paystub has no HSA, employer HSA or pre-tax hospital indemnity left, so a second
 * run finds nothing to do. Self-contained (node:sqlite, no app imports) so it runs inside the server container.
 */
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

export const TAX_YEAR = 2026
export const TAXPAYER_ID = 'mae'

type Cents = number
interface Benefits {
  medical: Cents
  dental: Cents
  vision: Cents
  healthcareFsa: Cents
  dependentFsa: Cents
  hsa: Cents
  retirement401k: Cents
  hospitalIndemnity?: Cents
}
export interface Paystub {
  id: string
  taxYear: number
  taxpayerId: string
  payDate: string
  updatedAt: string
  gross: Cents
  preTax: Cents
  federalWithholding: Cents
  caWithholding: Cents
  socialSecurity: Cents
  medicare: Cents
  caSdi: Cents
  benefits?: Benefits
  employerHsa?: Cents
  afterTax?: { hospitalIndemnity: Cents; other: Cents }
  [key: string]: unknown
}

export interface Change {
  hsaTo401k: Cents
  employerHsaRemoved: Cents
  hospitalIndemnityToAfterTax: Cents
}

const dollars = (c: Cents) => `$${(c / 100).toFixed(2)}`
const afterTaxTotal = (r: Paystub) => (r.afterTax ? r.afterTax.hospitalIndemnity + r.afterTax.other : 0)
const netPay = (r: Paystub) =>
  r.gross - r.preTax - r.federalWithholding - r.caWithholding - r.socialSecurity - r.medicare - r.caSdi - afterTaxTotal(r)
const benefitsTotal = (b: Benefits) => Object.values(b).reduce<number>((t, v) => t + (v ?? 0), 0)

export const inScope = (r: Paystub) => r.taxYear === TAX_YEAR && r.taxpayerId === TAXPAYER_ID

/** The reclassified paystub, or null when there is nothing to change (out of scope or already fixed). */
export function reclassify(r: Paystub, now: string): { record: Paystub; change: Change } | null {
  if (!inScope(r) || !r.benefits) return null
  const change: Change = {
    hsaTo401k: r.benefits.hsa,
    employerHsaRemoved: r.employerHsa ?? 0,
    hospitalIndemnityToAfterTax: r.benefits.hospitalIndemnity ?? 0,
  }
  if (!change.hsaTo401k && !change.employerHsaRemoved && !change.hospitalIndemnityToAfterTax) return null

  const benefits: Benefits = { ...r.benefits, hsa: 0, retirement401k: r.benefits.retirement401k + change.hsaTo401k }
  delete benefits.hospitalIndemnity
  const prior = r.afterTax ?? { hospitalIndemnity: 0, other: 0 }
  const record: Paystub = {
    ...r,
    benefits,
    preTax: r.preTax - change.hospitalIndemnityToAfterTax,
    employerHsa: 0,
    updatedAt: now,
  }
  if (change.hospitalIndemnityToAfterTax || r.afterTax) {
    record.afterTax = { ...prior, hospitalIndemnity: prior.hospitalIndemnity + change.hospitalIndemnityToAfterTax }
  }
  return { record, change }
}

/** Problems with a before → after pair; empty when it reconciles. */
export function reconcile(before: Paystub, after: Paystub): string[] {
  const problems: string[] = []
  const same = (k: keyof Paystub) => {
    if (before[k] !== after[k]) problems.push(`${k} changed ${String(before[k])} → ${String(after[k])}`)
  }
  for (const k of ['id', 'taxYear', 'taxpayerId', 'payDate', 'gross', 'federalWithholding', 'caWithholding', 'socialSecurity', 'medicare', 'caSdi'] as const) same(k)
  if (netPay(before) !== netPay(after)) problems.push(`net pay changed ${dollars(netPay(before))} → ${dollars(netPay(after))}`)
  if (!after.benefits || benefitsTotal(after.benefits) !== after.preTax) problems.push('pre-tax total does not match its line items')
  if (after.benefits?.hsa) problems.push('HSA left over')
  if (after.benefits && 'hospitalIndemnity' in after.benefits) problems.push('hospital indemnity still pre-tax')
  if (after.employerHsa) problems.push('employer HSA left over')
  const b = before.benefits
  if (b && after.benefits && after.benefits.retirement401k !== b.retirement401k + b.hsa) problems.push('401(k) is not the old 401(k) plus the old HSA')
  if (b && afterTaxTotal(after) !== afterTaxTotal(before) + (b.hospitalIndemnity ?? 0)) problems.push('after-tax is not the old after-tax plus hospital indemnity')
  return problems
}

export function auditSummary(c: Change): string {
  const parts = [
    c.hsaTo401k && `HSA ${dollars(c.hsaTo401k)} → 401(k)`,
    c.employerHsaRemoved && `employer HSA ${dollars(c.employerHsaRemoved)} removed (employer 401(k) match)`,
    c.hospitalIndemnityToAfterTax && `hospital indemnity ${dollars(c.hospitalIndemnityToAfterTax)} → after-tax`,
  ].filter(Boolean)
  return `Reclassified paystub (ADP labels): ${parts.join('; ')}`
}

function main(args: string[]) {
  const file = args.find((a) => !a.startsWith('--'))
  const apply = args.includes('--apply')
  if (!file) {
    console.error('usage: node scripts/reclassify-mae-paystubs-2026.ts <db> [--apply]')
    process.exit(2)
  }
  const db = new DatabaseSync(file, { readOnly: !apply })
  db.exec('PRAGMA busy_timeout = 5000')
  const load = () =>
    db
      .prepare('SELECT data FROM payroll WHERE tax_year = ?')
      .all(TAX_YEAR)
      .map((row) => JSON.parse(String(row.data)) as Paystub)
      .filter(inScope)
      .sort((a, b) => a.payDate.localeCompare(b.payDate))

  const now = new Date().toISOString()
  const before = load()
  const plan = before.map((r) => ({ before: r, result: reclassify(r, now) }))
  const todo = plan.filter((p) => p.result !== null)

  console.log(`${file}: ${before.length} ${TAXPAYER_ID} paystubs in ${TAX_YEAR}, ${todo.length} to reclassify`)
  for (const p of plan) {
    const c = p.result?.change
    console.log(
      `  ${p.before.payDate} ${p.before.id.padEnd(24)}  ` +
        (c ? `HSA→401k ${dollars(c.hsaTo401k)}  employer HSA −${dollars(c.employerHsaRemoved)}  hosp→after-tax ${dollars(c.hospitalIndemnityToAfterTax)}  net ${dollars(netPay(p.before))}` : 'unchanged'),
    )
  }
  const total = (f: (c: Change) => Cents) => dollars(todo.reduce((t, p) => t + f(p.result!.change), 0))
  console.log(`  totals: HSA→401k ${total((c) => c.hsaTo401k)}, employer HSA removed ${total((c) => c.employerHsaRemoved)}, hospital indemnity→after-tax ${total((c) => c.hospitalIndemnityToAfterTax)}`)

  const problems = todo.flatMap((p) => reconcile(p.before, p.result!.record).map((m) => `${p.before.payDate}: ${m}`))
  if (problems.length) {
    console.error('Planned changes do not reconcile; nothing written:\n  ' + problems.join('\n  '))
    process.exit(1)
  }
  if (!apply) {
    console.log(todo.length ? 'Dry run: nothing written. Re-run with --apply.' : 'Nothing to do.')
    return
  }
  if (!todo.length) {
    console.log('Nothing to do; database untouched.')
    return
  }

  const backup = `${file}.backup-${now.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)}-pre-reclassify`
  db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`)
  console.log(`Backed up to ${backup}`)

  const write = db.prepare('UPDATE payroll SET data = ?, updated_at = ? WHERE id = ?')
  const audit = db.prepare('INSERT INTO audit_events (id, tax_year, data, created_at, updated_at) VALUES (?, NULL, ?, ?, ?)')
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const p of todo) {
      const { record, change } = p.result!
      write.run(JSON.stringify(record), now, record.id)
      const id = randomUUID()
      const event = { at: now, actor: 'owner', action: 'update', entity: 'payroll', entityId: record.id, summary: auditSummary(change), id, createdAt: now, updatedAt: now }
      audit.run(id, JSON.stringify(event), now, now)
    }
    db.prepare("INSERT INTO meta (key, value) VALUES ('dataChangedAt', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(now)

    // Reconcile what is now in the database against what was there before, then make sure a re-run is a no-op.
    const after = new Map(load().map((r) => [r.id, r]))
    const stored = todo.flatMap((p) => {
      const a = after.get(p.before.id)
      return a ? reconcile(p.before, a).map((m) => `${p.before.payDate}: ${m}`) : [`${p.before.payDate}: missing after write`]
    })
    const leftover = [...after.values()].filter((r) => reclassify(r, now) !== null).length
    if (stored.length || leftover || after.size !== before.length) {
      throw new Error(`reconciliation failed: ${[...stored, leftover ? `${leftover} still need reclassifying` : '', after.size !== before.length ? 'paystub count changed' : ''].filter(Boolean).join('; ')}`)
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    console.error(`Rolled back; database unchanged. ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  console.log(`Applied: ${todo.length} paystubs reclassified, ${todo.length} audit events written, all reconciled.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
