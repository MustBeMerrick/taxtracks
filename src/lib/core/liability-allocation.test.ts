import { describe, expect, it } from 'vitest'
import {
  allocateHouseholdLiability,
  allocateJointPayments,
  roundToTotal,
  splitByWeights,
  type AllocationRecords,
  type LiabilityAllocation,
} from './liability-allocation'
import { cents } from './money'
import { buildOverview, type OverviewInput } from './overview'
import { estimateHouseholdTax } from './tax-liability'
import type { Deduction, InvestmentSourceSummary, PayrollRecord, TaxPayment } from './types'

const meta = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }

/** A year of 24 semi-monthly paychecks adding up to `annual` gross, with optional annual HSA. */
function paychecks(taxpayerId: string, annual: number, opts: { hsa?: number; caWithheld?: number; fedWithheld?: number } = {}): PayrollRecord[] {
  return Array.from({ length: 24 }, (_, i) => {
    const gross = cents(annual / 24)
    const hsa = cents((opts.hsa ?? 0) / 24)
    return {
      ...meta,
      id: `${taxpayerId}-${i}`,
      taxYear: 2026,
      taxpayerId,
      employer: 'Employer',
      payDate: `2026-${String(Math.floor(i / 2) + 1).padStart(2, '0')}-${i % 2 ? '28' : '15'}`,
      status: 'projected' as const,
      gross,
      preTax: hsa,
      benefits: { medical: 0, dental: 0, vision: 0, healthcareFsa: 0, dependentFsa: 0, hsa, retirement401k: 0 },
      federalWithholding: cents((opts.fedWithheld ?? annual * 0.18) / 24),
      caWithholding: cents((opts.caWithheld ?? annual * 0.07) / 24),
      socialSecurity: 0,
      medicare: 0,
      caSdi: 0,
    }
  })
}

const brokerage = (owner: string, shortTerm: number, longTerm: number, dividends: number, id = `${owner}-acct`): InvestmentSourceSummary => ({
  ...meta,
  id,
  taxYear: 2026,
  name: id,
  owner,
  shortTerm: cents(shortTerm),
  longTerm: cents(longTerm),
  dividendsInterest: cents(dividends),
  status: 'projected',
})

const records = (over: Partial<AllocationRecords> = {}): AllocationRecords => ({
  taxpayerIds: ['marc', 'mae'],
  payroll: [...paychecks('marc', 207_200, { hsa: 1_200 }), ...paychecks('mae', 169_500)],
  investments: [brokerage('marc', 17_466.14, 3_431, 5_375)],
  carryovers: [],
  deductions: [],
  taxPayments: [],
  ...over,
})

const allocate = (r: AllocationRecords) => allocateHouseholdLiability(2026, 'mfj', r)!
const joint = (r: AllocationRecords) => {
  const e = estimateHouseholdTax(2026, 'mfj', r)!.estimate
  return { federal: e.federal.total, ca: e.california.total }
}
const scenario = (r: AllocationRecords, investments: InvestmentSourceSummary[]) => joint({ ...r, investments })

/** People add up to the household exactly, total = baseline + investment, and the household is the engine's joint tax. */
function expectReconciles(a: LiabilityAllocation, r: AllocationRecords) {
  expect(a.household).toEqual(joint(r))
  for (const j of ['federal', 'ca'] as const) {
    const people = Object.values(a.people)
    expect(people.reduce((t, p) => t + p.total[j], 0)).toBe(a.household[j])
    for (const p of people) {
      expect(p.baseline[j] + p.investment[j]).toBe(p.total[j])
      expect(Number.isInteger(p.total[j]) && Number.isInteger(p.baseline[j])).toBe(true)
    }
  }
}

describe('rounding', () => {
  it('rounds to whole cents that add up exactly, including negatives', () => {
    expect(roundToTotal([100.5, 100.5], 201)).toEqual([101, 100])
    expect(roundToTotal([-0.4, 10.4], 10)).toEqual([0, 10])
    expect(splitByWeights(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(splitByWeights(100, [0, 0])).toEqual([50, 50])
    expect(splitByWeights(100, [-5, 5])).toEqual([0, 100])
  })
})

describe('source attributed', () => {
  it('only Marc has investments: Marc carries the whole increment, the baseline splits by wages', () => {
    const r = records()
    const a = allocate(r).source_attributed
    const base = scenario(r, [])
    const full = joint(r)
    for (const j of ['federal', 'ca'] as const) {
      expect(a.people.marc.investment[j] + a.people.mae.investment[j]).toBe(full[j] - base[j])
      expect(Math.abs(a.people.mae.investment[j])).toBeLessThanOrEqual(1) // rounding only
      expect(a.people.marc.baseline[j] + a.people.mae.baseline[j]).toBe(base[j])
    }
    // Federal baseline by Box 1 wages: Marc 206,000, Mae 169,500.
    expect(a.people.marc.baseline.federal).toBe(Math.round((base.federal * 206_000) / 375_500))
    // California taxes the HSA, so its baseline weights use full gross: 207,200 vs 169,500.
    expect(a.people.marc.baseline.ca).toBe(Math.round((base.ca * 207_200) / 376_700))
    expectReconciles(a, r)
  })

  it('only Mae has investments: the increment is hers', () => {
    const r = records({ investments: [brokerage('mae', 17_466.14, 3_431, 5_375)] })
    const a = allocate(r).source_attributed
    const base = scenario(r, [])
    expect(a.people.mae.investment.federal).toBeCloseTo(joint(r).federal - base.federal, -1)
    expect(Math.abs(a.people.marc.investment.federal)).toBeLessThanOrEqual(1)
    expectReconciles(a, r)
  })

  it('both have investments: a symmetric (Shapley) split of the increment', () => {
    const r = records({ investments: [brokerage('marc', 10_000, 2_000, 3_000), brokerage('mae', 4_000, 1_000, 500)] })
    const a = allocate(r).source_attributed
    const T0 = scenario(r, [])
    const TM = scenario(r, [r.investments[0]])
    const TA = scenario(r, [r.investments[1]])
    const TMA = joint(r)
    for (const j of ['federal', 'ca'] as const) {
      const deltaM = 0.5 * (TM[j] - T0[j] + (TMA[j] - TA[j]))
      expect(Math.abs(a.people.marc.investment[j] - deltaM)).toBeLessThanOrEqual(1)
    }
    expectReconciles(a, r)
  })

  it('identical investments get identical increments', () => {
    const r = records({ investments: [brokerage('marc', 5_000, 1_000, 1_000), brokerage('mae', 5_000, 1_000, 1_000)] })
    const a = allocate(r).source_attributed
    expect(Math.abs(a.people.marc.investment.federal - a.people.mae.investment.federal)).toBeLessThanOrEqual(1)
    expectReconciles(a, r)
  })

  it('no investments: reduces to the wage-proportional baseline', () => {
    const r = records({ investments: [] })
    const a = allocate(r).source_attributed
    expect(a.people.marc.investment).toEqual({ federal: 0, ca: 0 })
    expect(a.people.marc.total).toEqual(a.people.marc.baseline)
    expectReconciles(a, r)
  })

  it('one spouse without wages: the other carries the whole baseline', () => {
    const r = records({ payroll: paychecks('marc', 207_200) })
    const a = allocate(r).source_attributed
    expect(a.people.mae.baseline).toEqual({ federal: 0, ca: 0 })
    expect(a.people.mae.total).toEqual({ federal: 0, ca: 0 })
    expectReconciles(a, r)
  })

  it('neither has wages: the baseline splits equally, and says so', () => {
    const r = records({ payroll: [], investments: [brokerage('marc', 150_000, 50_000, 10_000)] })
    const a = allocate(r).source_attributed
    expect(a.note).toMatch(/split equally/)
    expect(Math.abs(a.people.marc.baseline.federal - a.people.mae.baseline.federal)).toBeLessThanOrEqual(1)
    expectReconciles(a, r)
  })

  it('net investment losses give a negative increment (they lower the joint tax)', () => {
    const r = records({ investments: [brokerage('marc', -8_000, -2_000, 0)] })
    const a = allocate(r).source_attributed
    expect(a.people.marc.investment.federal).toBeLessThan(0) // $3,000 loss allowed against ordinary income
    expect(a.people.marc.investment.ca).toBeLessThan(0)
    expectReconciles(a, r)
  })

  it('keeps a joint capital-loss carryover in every scenario', () => {
    const r = records({ carryovers: [{ ...meta, id: 'c', taxYear: 2026, jurisdiction: 'federal', kind: 'capital_loss_long', amount: cents(10_000) }] })
    expectReconciles(allocate(r).source_attributed, r)
  })

  it('NIIT is investment tax; Additional Medicare stays in the baseline', () => {
    const r = records()
    const full = estimateHouseholdTax(2026, 'mfj', r)!.estimate.federal
    const base = estimateHouseholdTax(2026, 'mfj', { ...r, investments: [] })!.estimate.federal
    expect(full.niit).toBeGreaterThan(0)
    expect(base.niit).toBe(0)
    expect(base.additionalMedicare).toBe(full.additionalMedicare)
  })

  it('attributes owned deductions to their owner and keeps household deductions in the baseline', () => {
    const d = (owner: string, amount: number): Deduction => ({ ...meta, id: `d-${owner}`, taxYear: 2026, owner, category: 'charity_cash', amount: cents(amount), status: 'manual_estimate' })
    const withOwned = records({ investments: [], deductions: [d('mae', 30_000)] })
    const owned = allocate(withOwned).source_attributed
    expect(owned.people.mae.investment.federal).toBeLessThan(0)
    expect(Math.abs(owned.people.marc.investment.federal)).toBeLessThanOrEqual(1)
    expectReconciles(owned, withOwned)

    const withJoint = records({ investments: [], deductions: [d('household', 30_000)] })
    const shared = allocate(withJoint).source_attributed
    expect(shared.people.mae.investment).toEqual({ federal: 0, ca: 0 })
    expectReconciles(shared, withJoint)
  })
})

describe('income proportional', () => {
  it('splits the same joint tax by personal income', () => {
    const r = records()
    const a = allocate(r).income_proportional
    expect(a.household).toEqual(allocate(r).source_attributed.household)
    expect(a.people.marc.investment).toEqual({ federal: 0, ca: 0 })
    expectReconciles(a, r)
  })
})

describe('Overview with an allocation', () => {
  const r = records({
    taxPayments: [{ ...meta, id: 'p', taxYear: 2026, jurisdiction: 'federal', date: '2026-06-15', amount: cents(2_000), kind: 'estimated', status: 'actual' } satisfies TaxPayment],
  })
  const allocations = allocate(r)
  const e = estimateHouseholdTax(2026, 'mfj', r)!.estimate
  const input: OverviewInput = {
    taxpayers: [
      { ...meta, id: 'marc', name: 'Marc', householdId: 'h' },
      { ...meta, id: 'mae', name: 'Mae', householdId: 'h' },
    ] as OverviewInput['taxpayers'],
    payroll: r.payroll,
    investments: r.investments,
    otherIncome: [],
    activity: [],
    taxPayments: r.taxPayments,
    liabilities: [
      { ...meta, id: 'f', taxYear: 2026, jurisdiction: 'federal', amount: e.federal.total, status: 'projected', source: 'engine' },
      { ...meta, id: 'c', taxYear: 2026, jurisdiction: 'ca', amount: e.california.total, status: 'projected', source: 'engine' },
    ],
  }

  it('leaves the household view identical whichever method is chosen', () => {
    const a = buildOverview({ ...input, allocation: allocations.income_proportional }, 'household')
    const b = buildOverview({ ...input, allocation: allocations.source_attributed }, 'household')
    const none = buildOverview(input, 'household')
    expect(b).toEqual(a)
    expect(none).toEqual(a)
  })

  it.each(['income_proportional', 'source_attributed'] as const)('%s: people add up to the household in liability, payments and balance', (method) => {
    const h = buildOverview({ ...input, allocation: allocations[method] }, 'household')
    const marc = buildOverview({ ...input, allocation: allocations[method] }, 'marc')
    const mae = buildOverview({ ...input, allocation: allocations[method] }, 'mae')
    for (const key of ['liability', 'payments', 'refund'] as const) {
      for (const j of ['federal', 'ca', 'total'] as const) expect(marc[key][j] + mae[key][j]).toBe(h[key][j])
    }
    expect(marc.allocation?.method).toBe(method)
  })

  it('source attributed moves tax from Mae to Marc compared with income proportional', () => {
    const byIncome = buildOverview({ ...input, allocation: allocations.income_proportional }, 'mae')
    const bySource = buildOverview({ ...input, allocation: allocations.source_attributed }, 'mae')
    expect(bySource.liability.total).toBeLessThan(byIncome.liability.total)
  })

  it('splits joint estimated payments in proportion to allocated liability', () => {
    const shares = allocateJointPayments(cents(2_000), ['marc', 'mae'], (id) => allocations.source_attributed.people[id].total.federal)
    const marc = buildOverview({ ...input, allocation: allocations.source_attributed }, 'marc')
    expect(marc.allocation?.jointPayments.federal).toBe(shares[0])
    expect(shares[0] + shares[1]).toBe(cents(2_000))
  })
})
