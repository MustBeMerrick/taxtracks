import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { openDb } from '../src/lib/db'
import { auditSummary, reclassify, reconcile, type Paystub } from './reclassify-mae-paystubs-2026'

// One of Mae's regular 2026 checks as entered (redacted round numbers, the real line structure).
const maeStub = (over: Partial<Paystub> = {}): Paystub => ({
  id: 'stub-1',
  createdAt: '2026-01-15T00:00:00Z',
  updatedAt: '2026-01-15T00:00:00Z',
  taxYear: 2026,
  taxpayerId: 'mae',
  employer: 'Employer',
  payDate: '2026-01-15',
  status: 'actual',
  gross: 583_333,
  benefits: { medical: 9_850, dental: 850, vision: 807, healthcareFsa: 0, dependentFsa: 0, hsa: 26_400, retirement401k: 0, hospitalIndemnity: 646 },
  preTax: 9_850 + 850 + 807 + 26_400 + 646,
  gtli: 920,
  employerHsa: 22_570,
  federalWithholding: 80_000,
  caWithholding: 35_000,
  socialSecurity: 35_510,
  medicare: 8_305,
  caSdi: 7_000,
  ...over,
})

const NOW = '2026-11-04T00:00:00.000Z'

describe('reclassify one paystub', () => {
  const before = maeStub()
  const { record, change } = reclassify(before, NOW)!

  it('moves each line by its own amount', () => {
    expect(change).toEqual({ hsaTo401k: 26_400, employerHsaRemoved: 22_570, hospitalIndemnityToAfterTax: 646 })
    expect(record.benefits).toEqual({ medical: 9_850, dental: 850, vision: 807, healthcareFsa: 0, dependentFsa: 0, hsa: 0, retirement401k: 26_400 })
    expect(record.preTax).toBe(9_850 + 850 + 807 + 26_400)
    expect(record.afterTax).toEqual({ hospitalIndemnity: 646, other: 0 })
    expect(record.employerHsa).toBe(0)
    expect(record.updatedAt).toBe(NOW)
  })

  it('reconciles: gross, withholding and net pay unchanged', () => {
    expect(reconcile(before, record)).toEqual([])
    expect(record.gtli).toBe(before.gtli)
  })

  it('is idempotent', () => {
    expect(reclassify(record, NOW)).toBeNull()
  })

  it('leaves other people, other years and lump-total stubs alone', () => {
    expect(reclassify(maeStub({ taxpayerId: 'marc' }), NOW)).toBeNull()
    expect(reclassify(maeStub({ taxYear: 2025 }), NOW)).toBeNull()
    expect(reclassify(maeStub({ benefits: undefined }), NOW)).toBeNull()
  })

  it('catches a bad result', () => {
    expect(reconcile(before, { ...record, caWithholding: 1 })).toContain('caWithholding changed 35000 → 1')
    expect(reconcile(before, { ...record, afterTax: undefined }).some((p) => p.startsWith('net pay changed'))).toBe(true)
  })

  it('writes a readable audit summary', () => {
    expect(auditSummary(change)).toBe('Reclassified paystub (ADP labels): HSA $264.00 → 401(k); employer HSA $225.70 removed (employer 401(k) match); hospital indemnity $6.46 → after-tax')
  })
})

describe('the CLI against a real database file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reclassify-'))
  const file = path.join(dir, 'taxtracks.db')
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  const seed = () => {
    const db = openDb(file)
    const put = db.prepare('INSERT INTO payroll (id, tax_year, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    const rows = [maeStub(), maeStub({ id: 'stub-2', payDate: '2026-01-30' }), maeStub({ id: 'marc-1', taxpayerId: 'marc' })]
    for (const r of rows) put.run(r.id, r.taxYear, JSON.stringify(r), String(r.createdAt), r.updatedAt)
    db.close()
  }
  const run = (...args: string[]) => execFileSync(process.execPath, [path.join(import.meta.dirname, 'reclassify-mae-paystubs-2026.ts'), file, ...args], { encoding: 'utf8' })
  const read = () => {
    const db = new DatabaseSync(file, { readOnly: true })
    const payroll = db.prepare('SELECT data FROM payroll ORDER BY id').all().map((r) => JSON.parse(String(r.data)) as Paystub)
    const audits = db.prepare("SELECT data FROM audit_events WHERE data LIKE '%Reclassified%'").all().length
    db.close()
    return { payroll, audits }
  }

  it('dry run writes nothing', () => {
    seed()
    copyFileSync(file, `${file}.orig`)
    expect(run()).toContain('2 to reclassify')
    expect(read().payroll.find((r) => r.id === 'stub-1')!.benefits!.hsa).toBe(26_400)
    expect(read().audits).toBe(0)
  })

  it('apply backs up, reclassifies only Mae, audits each paystub; a second run is a no-op', () => {
    expect(run('--apply')).toContain('2 paystubs reclassified')
    expect(readdirSync(dir).some((f) => f.includes('pre-reclassify'))).toBe(true)
    const { payroll, audits } = read()
    expect(audits).toBe(2)
    expect(payroll.find((r) => r.id === 'marc-1')).toEqual(maeStub({ id: 'marc-1', taxpayerId: 'marc' }))
    for (const id of ['stub-1', 'stub-2']) {
      const r = payroll.find((p) => p.id === id)!
      expect(reconcile(maeStub({ id, payDate: r.payDate }), r)).toEqual([])
    }
    expect(run('--apply')).toContain('Nothing to do')
    expect(read().audits).toBe(2)
    expect(existsSync(`${file}.orig`)).toBe(true)
  })
})
