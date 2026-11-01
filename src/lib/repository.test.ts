import { beforeEach, describe, expect, it } from 'vitest'
import { migrate, openDb } from '@/lib/db'
import { buildOverview } from '@/lib/core/overview'
import * as sample from '@/lib/fixtures/sample-2026'
import { parseExportFile, TaxDataRepository } from '@/lib/repository'

let repo: TaxDataRepository

beforeEach(() => {
  repo = new TaxDataRepository(openDb(':memory:'))
})

describe('paystubs', () => {
  it('keeps line items through save, Paid Out toggle and reload; Paid Out drives the Overview paid-to-date', () => {
    repo.ensureSeeded()
    const saved = repo.put('payroll', {
      taxYear: 2026,
      taxpayerId: 'marc',
      employer: 'Acme',
      payDate: '2026-12-31',
      status: 'projected',
      gross: 918542,
      preTax: 8328,
      federalWithholding: 173653,
      caWithholding: 71938,
      socialSecurity: 56475,
      medicare: 13208,
      caSdi: 11963,
      benefits: { medical: 2951, dental: 342, vision: 35, healthcareFsa: 0, dependentFsa: 0, hsa: 5000, retirement401k: 0 },
      gtli: 670,
      employerHsa: 5000,
    })
    const paidFederal = () => buildOverview(repo.yearData(2026), 'household').paymentsActual.federal
    const before = paidFederal()
    repo.put('payroll', { ...repo.get('payroll', saved.id)!, status: 'actual' })
    expect(paidFederal()).toBe(before + 173653)
    const reloaded = repo.get('payroll', saved.id)!
    expect(reloaded.benefits?.hsa).toBe(5000)
    expect(reloaded.gtli).toBe(670)
    expect(reloaded.createdAt).toBe(saved.createdAt)
  })
})

describe('migrations 2-3: sample pay dates', () => {
  const setDate = (db: ReturnType<typeof openDb>, id: string, payDate: string) =>
    db.prepare('UPDATE payroll SET data = json_set(data, \'$.payDate\', ?) WHERE id = ?').run(payDate, id)

  it('moves only weekend dates to the Friday before, and repairs dates an earlier draft forced to Fridays', () => {
    const db = openDb(':memory:')
    const sampleRepo = new TaxDataRepository(db)
    sampleRepo.ensureSeeded()
    const byDate = (date: string) => sampleRepo.all('payroll').find((r) => r.taxpayerId === 'marc' && r.id.includes(`-${date}-`))!

    const weekday = byDate('2026-10-30') // Oct 31 is a Saturday, so the sample uses Oct 30
    const midweek = byDate('2026-10-15') // a Thursday: must stay on the 15th
    setDate(db, weekday.id, '2026-10-31')
    setDate(db, midweek.id, '2026-10-09') // what the broken draft produced
    db.exec('PRAGMA user_version = 1')
    migrate(db)
    expect(sampleRepo.get('payroll', weekday.id)?.payDate).toBe('2026-10-30')
    expect(sampleRepo.get('payroll', midweek.id)?.payDate).toBe('2026-10-15')
  })

  it('leaves real (non-sample) data alone', () => {
    const db = openDb(':memory:')
    const realRepo = new TaxDataRepository(db)
    realRepo.clearAll()
    const real = realRepo.put('payroll', { taxYear: 2026, taxpayerId: 'marc', employer: 'X', payDate: '2026-10-31', status: 'actual', gross: 1, preTax: 0, federalWithholding: 0, caWithholding: 0, socialSecurity: 0, medicare: 0, caSdi: 0 })
    db.exec('PRAGMA user_version = 1')
    migrate(db)
    expect(realRepo.get('payroll', real.id)?.payDate).toBe('2026-10-31')
  })
})

describe('TaxDataRepository', () => {
  it('seeds sample data once', () => {
    expect(repo.ensureSeeded()).toBe(true)
    expect(repo.ensureSeeded()).toBe(false)
    expect(repo.isSample()).toBe(true)
    expect(repo.count('payroll')).toBe(sample.payroll.length)
  })

  it('loads year data that reproduces the fixture overview exactly', () => {
    repo.ensureSeeded()
    const fromDb = buildOverview(repo.yearData(2026), 'household')
    const fromFixture = buildOverview(sample, 'household')
    expect(fromDb.refund).toEqual(fromFixture.refund)
    expect(fromDb.income.total).toBe(fromFixture.income.total)
    expect(fromDb.monthly).toEqual(fromFixture.monthly)
  })

  it('round-trips export → clear → import without loss', () => {
    repo.ensureSeeded()
    const exported = JSON.parse(JSON.stringify(repo.exportAll()))
    repo.clearAll(2026)
    expect(repo.count('payroll')).toBe(0)
    const { records } = repo.importAll(exported)
    expect(records).toBeGreaterThan(0)
    expect(repo.all('payroll')).toEqual(exported.tables.payroll)
  })

  it('stamps metadata and audit events on put, and marks data changed', async () => {
    repo.ensureSeeded()
    const before = repo.dataChangedAt()
    await new Promise((r) => setTimeout(r, 5))
    const saved = repo.put('otherIncome', { id: 'x1', taxYear: 2026, label: 'Jury duty', owner: 'marc', amount: 4_000, status: 'actual' })
    expect(saved.createdAt).toBe(saved.updatedAt)
    expect(repo.dataChangedAt()! > before!).toBe(true)
    expect(repo.recentAudit().some((e) => e.action === 'create' && e.entityId === 'x1')).toBe(true)

    await new Promise((r) => setTimeout(r, 5))
    const updated = repo.put('otherIncome', { ...saved, amount: 5_000 })
    expect(updated.createdAt).toBe(saved.createdAt)
    expect(repo.recentAudit()[0]).toMatchObject({ action: 'update', entityId: 'x1' })
  })

  it('rolls back a failed write', () => {
    repo.ensureSeeded()
    const before = repo.count('otherIncome')
    // A non-JSON-serialisable value (BigInt) makes the write throw mid-transaction.
    expect(() => repo.put('otherIncome', { taxYear: 2026, label: 'bad', owner: 'joint', amount: 1n as unknown as number, status: 'actual' })).toThrow()
    expect(repo.count('otherIncome')).toBe(before)
  })

  it('saves calculation runs without marking data changed', () => {
    repo.ensureSeeded()
    const changed = repo.dataChangedAt()
    const zero = { federal: 0, ca: 0 }
    repo.saveRun({ taxYear: 2026, ranAt: new Date().toISOString(), inputsHash: 'h', rulesVersion: 'none', outputs: { liability: zero, payments: zero, refund: zero } })
    expect(repo.dataChangedAt()).toBe(changed)
    expect(repo.latestRun(2026)?.inputsHash).toBe('h')
  })

  it('clearAll leaves an empty, non-sample household with a tax year', () => {
    repo.ensureSeeded()
    repo.clearAll(2026)
    expect(repo.isSample()).toBe(false)
    expect(repo.count('households')).toBe(1)
    expect(repo.taxYears().map((t) => t.year)).toEqual([2026])
    expect(repo.count('payroll')).toBe(0)
  })
})

describe('parseExportFile', () => {
  it('rejects foreign or malformed files', () => {
    expect(() => parseExportFile({ app: 'other' })).toThrow(/Not a Tax Tracks/)
    expect(() => parseExportFile({ app: 'taxtracks', schemaVersion: 99, tables: {} })).toThrow(/schema version 99/)
    expect(() => parseExportFile({ app: 'taxtracks', schemaVersion: 1, tables: { bogus: [] } })).toThrow(/Unknown table/)
    expect(() => parseExportFile({ app: 'taxtracks', schemaVersion: 1, tables: { payroll: [{}] } })).toThrow(/no id/)
  })
})
