import { describe, expect, it } from 'vitest'
import { allocateHouseholdLiability } from './liability-allocation'
import { cents } from './money'
import { buildOverview, type OverviewInput } from './overview'
import { estimatedLiabilities, estimateHouseholdTax, estimateSeparateReturns, householdLiability, type HouseholdRecords } from './tax-liability'
import type { InvestmentSourceSummary, PayrollRecord, Taxpayer } from './types'
import { buildVisualization, effectiveRates, type BracketBar, type BracketView } from './visualization'

const meta = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', status: 'projected' as const }

const stub = (taxpayerId: string, gross: number, caWithheld: number): PayrollRecord => ({
  ...meta,
  id: `${taxpayerId}-stub`,
  taxYear: 2026,
  taxpayerId,
  employer: 'Employer',
  payDate: '2026-12-31',
  gross: cents(gross),
  preTax: 0,
  federalWithholding: 0,
  caWithholding: cents(caWithheld),
  socialSecurity: 0,
  medicare: 0,
  caSdi: 0,
})

const brokerage = (owner: string, shortTerm: number, longTerm: number, dividends: number): InvestmentSourceSummary => ({
  ...meta,
  id: `${owner}-acct`,
  taxYear: 2026,
  name: 'Brokerage',
  owner,
  shortTerm: cents(shortTerm),
  longTerm: cents(longTerm),
  dividendsInterest: cents(dividends),
})

const people = [
  { id: 'marc', name: 'Marc' },
  { id: 'mae', name: 'Mae' },
]
const records: HouseholdRecords = {
  taxpayerIds: ['marc', 'mae'],
  payroll: [stub('marc', 207_000, 20_000), stub('mae', 169_000, 13_000)],
  investments: [brokerage('marc', 2_800, 3_500, 4_500)],
  carryovers: [],
  deductions: [],
  taxPayments: [],
}
const viz = buildVisualization(2026, people, records)
const joint = estimateHouseholdTax(2026, 'mfj', records)!
const separate = estimateSeparateReturns(2026, records)!

/** Segments stack from zero with no gaps or overlaps. */
function expectContiguous(bar: BracketBar) {
  let at = 0
  for (const s of bar.segments) {
    expect(s.from).toBe(at)
    expect(s.to).toBeGreaterThan(s.from)
    at = s.to
  }
  expect(bar.total).toBe(at)
}
const taxTotal = (v: BracketView) => Object.values(v.taxByPerson).reduce((t, x) => t + x, 0)
const sumOf = (v: BracketView, person: string, kind?: string) =>
  v.bars.flatMap((b) => b.segments).filter((s) => s.person === person && (!kind || s.kind === kind)).reduce((t, s) => t + s.to - s.from, 0)

describe('joint pictures', () => {
  const fed = viz.joint!.federal
  const ca = viz.joint!.ca

  it('draws one household bar of taxable income (ordinary, then long-term gains), against the joint brackets', () => {
    for (const method of ['income_proportional', 'source_attributed'] as const) {
      const v = fed[method]
      expect(v.bars).toHaveLength(1)
      expectContiguous(v.bars[0])
      expect(v.bars[0].total).toBe(joint.summary.federalOrdinaryTaxable + joint.summary.ltcgIncome)
      expect(v.lines[0]).toEqual({ at: cents(24_800), rate: 0.12 })
    }
    expectContiguous(ca.income_proportional.bars[0])
    expect(ca.income_proportional.bars[0].total).toBe(joint.summary.stateTaxable)
  })

  it('adds up to the engine’s bracket and capital gains tax, to within a few cents of rounding', () => {
    const fedTax = joint.estimate.federal.ordinaryTax + joint.estimate.federal.capitalGainsTax
    expect(Math.abs(taxTotal(fed.income_proportional) - fedTax)).toBeLessThanOrEqual(10)
    expect(Math.abs(taxTotal(fed.source_attributed) - fedTax)).toBeLessThanOrEqual(10)
    expect(Math.abs(taxTotal(ca.income_proportional) - joint.estimate.california.tax)).toBeLessThanOrEqual(10)
  })

  it('by income: every bracket slice is split by income, so each person’s share of income matches their share of the bar', () => {
    const v = fed.income_proportional
    const marcIncome = cents(207_000 + 2_800 + 3_500 + 4_500)
    const share = marcIncome / (marcIncome + cents(169_000))
    expect(sumOf(v, 'marc') / v.bars[0].total).toBeCloseTo(share, 3)
  })

  it('by source: investments are Marc’s alone and sit on top of the wages', () => {
    const v = fed.source_attributed
    expect(sumOf(v, 'mae', 'investments')).toBe(0)
    expect(sumOf(v, 'mae', 'ltcg')).toBe(0)
    expect(sumOf(v, 'marc', 'ltcg')).toBe(joint.summary.ltcgIncome)
    const wagesTop = Math.max(...v.bars[0].segments.filter((s) => s.kind === 'wages').map((s) => s.to))
    const investBottom = Math.min(...v.bars[0].segments.filter((s) => s.kind === 'investments').map((s) => s.from))
    expect(investBottom).toBe(wagesTop)
  })

  it('marks the slices crossing a bracket edge with the rate above it', () => {
    const v = fed.income_proportional
    for (const s of v.bars[0].segments.filter((x) => x.kind !== 'ltcg')) {
      const line = [...v.lines].reverse().find((l) => s.from >= l.at)
      expect(s.rate).toBe(line ? line.rate : 0.1)
    }
  })
})

describe('separate pictures', () => {
  it('draws one bar per person against the separate-return brackets', () => {
    const v = viz.separate!.federal
    expect(v.filing).toBe('separate')
    expect(v.lines.find((l) => l.rate === 0.32)!.at).toBe(cents(201_775))
    expect(v.bars.map((b) => b.label)).toEqual(['Marc', 'Mae'])
    for (const bar of v.bars) {
      expectContiguous(bar)
      const s = separate.people[bar.key].summary
      expect(bar.total).toBe(s.federalOrdinaryTaxable + s.ltcgIncome)
      expect(bar.segments.every((x) => x.person === bar.key)).toBe(true)
    }
  })

  it('each bar’s tax is that return’s bracket and capital gains tax', () => {
    for (const id of ['marc', 'mae']) {
      const e = separate.people[id].estimate
      expect(Math.abs(viz.separate!.federal.taxByPerson[id] - (e.federal.ordinaryTax + e.federal.capitalGainsTax))).toBeLessThanOrEqual(5)
      expect(Math.abs(viz.separate!.ca.taxByPerson[id] - e.california.tax)).toBeLessThanOrEqual(5)
    }
  })

  it('as if separate (filing jointly) shows the same per-person bars', () => {
    const v = viz.joint!.federal.as_if_separate
    expect(v.filing).toBe('joint')
    expect(v.method).toBe('as_if_separate')
    expect(v.bars).toEqual(viz.separate!.federal.bars)
  })
})

describe('effective rates', () => {
  const taxpayers: Taxpayer[] = people.map((p) => ({ ...meta, householdId: 'household', ...p }))
  const joint = householdLiability(2026, 'mfj', records)!
  const own = householdLiability(2026, 'mfs', records)!
  const base = { taxpayers, payroll: records.payroll, investments: records.investments, otherIncome: [], activity: [] }
  const mfjYear: OverviewInput = { ...base, liabilities: estimatedLiabilities(2026, joint, '2026-01-01T00:00:00.000Z') }
  const mfsYear: OverviewInput = { ...base, liabilities: estimatedLiabilities(2026, own, '2026-01-01T00:00:00.000Z'), separateReturns: own.people }
  const splits = allocateHouseholdLiability(2026, 'mfj', records)!
  const rates = effectiveRates(mfjYear, splits, own.people!)

  it('are each person’s Overview rates under the same split', () => {
    for (const method of ['income_proportional', 'source_attributed', 'as_if_separate'] as const) {
      for (const id of ['marc', 'mae']) {
        const r = buildOverview({ ...mfjYear, allocation: splits[method] }, id).effectiveRates
        expect(rates.joint![method][id]).toEqual({ federal: r.federal, ca: r.ca })
      }
    }
  })

  it('filing separately: their own return over their own income', () => {
    const income = buildOverview(mfjYear, 'mae').income.total
    expect(rates.separate!.mae.federal).toBeCloseTo(own.people!.mae.federal / income, 10)
    expect(rates.separate!.mae.ca).toBeCloseTo(own.people!.mae.ca / income, 10)
  })

  it('previews a joint return’s splits from a separately filed year too', () => {
    expect(effectiveRates(mfsYear, splits, own.people!)).toEqual(rates)
  })
})
