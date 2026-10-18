import { beforeEach, describe, expect, it } from 'vitest'
import { openDb } from '@/lib/db'
import { buildOverview } from '@/lib/core/overview'
import * as sample from '@/lib/fixtures/sample-2026'
import { parseExportFile, TaxDataRepository } from '@/lib/repository'

let repo: TaxDataRepository

beforeEach(() => {
  repo = new TaxDataRepository(openDb(':memory:'))
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
