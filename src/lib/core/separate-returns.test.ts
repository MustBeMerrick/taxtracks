import { describe, expect, it } from 'vitest'
import { calculateIncomeSummary, type IncomeSummaryInput } from './income-summary'
import { allocateHouseholdLiability } from './liability-allocation'
import { cents } from './money'
import { buildOverview } from './overview'
import { estimatedLiabilities, estimateHouseholdTax, estimateSeparateReturns, householdLiability, type HouseholdRecords } from './tax-liability'
import type { Deduction, PayrollRecord, TaxPayment, Taxpayer } from './types'

const meta = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', status: 'projected' as const }

/** One annual paystub: wages and California withholding (the federal SALT itemized deduction). */
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

const records = (a: [number, number], b: [number, number], over: Partial<HouseholdRecords> = {}): HouseholdRecords => ({
  taxpayerIds: ['marc', 'mae'],
  payroll: [stub('marc', ...a), stub('mae', ...b)],
  investments: [],
  carryovers: [],
  deductions: [],
  taxPayments: [],
  ...over,
})

describe('deduction choice', () => {
  const input: IncomeSummaryInput = {
    filingStatus: 'mfs',
    salary: cents(160_000),
    shortTermProfit: 0,
    shortTermLoss: 0,
    longTermProfit: 0,
    longTermLoss: 0,
    dividends: 0,
    hsa: 0,
    section125: 0,
    retirement401k: 0,
    gtli: 0,
    employerHsa: 0,
    carryoverShort: 0,
    carryoverLong: 0,
    stateIncomeTaxWithheld: cents(13_000),
    charityCash: cents(500),
  }

  it('takes the larger by default', () => {
    const s = calculateIncomeSummary(2026, input)!
    expect(s.federalItemizes).toBe(false)
    expect(s.federalDeduction).toBe(cents(16_100 + 500))
  })

  it('itemizes when forced, even below the standard deduction, and loses the non-itemizer charity deduction', () => {
    const s = calculateIncomeSummary(2026, { ...input, federalDeductionChoice: 'itemized', stateDeductionChoice: 'itemized' })!
    expect(s.federalItemizes).toBe(true)
    expect(s.federalDeduction).toBe(cents(13_000) + Math.max(0, cents(500) - Math.round(s.federalAgi * 0.005)))
    expect(s.stateItemizes).toBe(true)
    expect(s.stateDeduction).toBe(cents(500)) // California itemized: charity only, below its $5,900 standard
  })

  it('takes the standard deduction when forced, even below itemized', () => {
    const s = calculateIncomeSummary(2026, { ...input, stateIncomeTaxWithheld: cents(19_000), federalDeductionChoice: 'standard' })!
    expect(s.federalItemizes).toBe(false)
    expect(s.federalDeduction).toBe(cents(16_100 + 500))
  })
})

describe('estimateSeparateReturns', () => {
  it('makes both spouses itemize when one does and that costs the pair less', () => {
    // Marc alone would itemize $20,000; Mae alone would take $16,100 over her $13,000. Together: $33,000 > $32,200.
    const r = estimateSeparateReturns(2026, records([200_000, 20_000], [160_000, 13_000]))!
    expect(r.federalItemizes).toBe(true)
    expect(r.people.mae.summary.federalItemizes).toBe(true)
    expect(r.people.mae.summary.federalDeduction).toBe(cents(13_000))
    expect(r.people.marc.summary.federalDeduction).toBe(cents(20_000))
  })

  it('matches the joint return when both spouses sit in the same brackets', () => {
    const recs = records([200_000, 20_000], [160_000, 13_000])
    const sep = estimateSeparateReturns(2026, recs)!
    const joint = estimateHouseholdTax(2026, 'mfj', recs)!.estimate
    // Married-filing-separately brackets are half the joint ones; per-slice rounding can differ by a few cents.
    expect(Math.abs(sep.total.federal - joint.federal.total)).toBeLessThanOrEqual(5)
    expect(Math.abs(sep.total.ca - joint.california.total)).toBeLessThanOrEqual(5)
  })

  it('makes both take the standard deduction when that costs the pair less', () => {
    // Marc alone would itemize $17,000 (> $16,100); with Mae's $2,000 the pair is better off at 2 × $16,100.
    const r = estimateSeparateReturns(2026, records([200_000, 17_000], [160_000, 2_000]))!
    expect(r.federalItemizes).toBe(false)
    expect(r.people.marc.summary.federalItemizes).toBe(false)
    expect(r.people.marc.summary.federalDeduction).toBe(cents(16_100))
    expect(r.total.federal).toBe(r.people.marc.estimate.federal.total + r.people.mae.estimate.federal.total)
  })

  it('splits household deductions and tax payments equally and keeps a spouse’s own deduction on their return', () => {
    const deduction = (owner: string, category: string, amount: number): Deduction => ({
      ...meta,
      id: `${owner}-${category}`,
      taxYear: 2026,
      owner,
      category,
      amount: cents(amount),
    })
    const payment: TaxPayment = { ...meta, id: 'ca-est', taxYear: 2026, jurisdiction: 'ca', date: '2026-06-15', amount: cents(3_000.01), kind: 'estimated' }
    const r = estimateSeparateReturns(
      2026,
      records([200_000, 0], [160_000, 0], {
        deductions: [deduction('household', 'property_tax', 10_000), deduction('marc', 'charity_cash', 1_000)],
        taxPayments: [payment],
      }),
    )!
    // State tax paid: half the property tax plus half the estimated payment (the odd cent goes to the first spouse).
    expect(r.people.marc.summary.stateItemizedDeduction).toBe(cents(5_000 + 1_000))
    expect(r.people.mae.summary.stateItemizedDeduction).toBe(cents(5_000))
    expect(r.people.marc.summary.federalSaltAllowed).toBe(cents(5_000 + 1_500.01))
    expect(r.people.mae.summary.federalSaltAllowed).toBe(cents(5_000 + 1_500))
  })
})

describe('household liability by filing status', () => {
  const recs = records([200_000, 20_000], [120_000, 6_000])

  it('is the joint return filing jointly, with no per-person returns', () => {
    const joint = estimateHouseholdTax(2026, 'mfj', recs)!.estimate
    expect(householdLiability(2026, 'mfj', recs)).toEqual({ federal: joint.federal.total, ca: joint.california.total })
  })

  it('is the two separate returns added together filing separately, with each spouse’s own', () => {
    const sep = estimateSeparateReturns(2026, recs)!
    const h = householdLiability(2026, 'mfs', recs)!
    expect(h.federal).toBe(sep.total.federal)
    expect(h.ca).toBe(sep.total.ca)
    expect(h.people!.mae).toEqual({ federal: sep.people.mae.estimate.federal.total, ca: sep.people.mae.estimate.california.total })
    expect(h.people!.marc.federal + h.people!.mae.federal).toBe(h.federal)
  })

  it('has nothing to allocate filing separately', () => {
    expect(allocateHouseholdLiability(2026, 'mfs', recs)).toBeNull()
    expect(allocateHouseholdLiability(2026, 'mfj', recs)).not.toBeNull()
  })
})

describe('Overview filing separately', () => {
  const recs = records([200_000, 20_000], [120_000, 6_000])
  const h = householdLiability(2026, 'mfs', recs)!
  const taxpayers: Taxpayer[] = [
    { ...meta, id: 'marc', householdId: 'household', name: 'Marc' },
    { ...meta, id: 'mae', householdId: 'household', name: 'Mae' },
  ]
  const payment: TaxPayment = { ...meta, id: 'fed-est', taxYear: 2026, jurisdiction: 'federal', date: '2026-06-15', amount: cents(1_000.01), kind: 'estimated' }
  const input = {
    taxpayers,
    payroll: recs.payroll,
    investments: [],
    otherIncome: [],
    liabilities: estimatedLiabilities(2026, h, '2026-01-01T00:00:00.000Z'),
    activity: [],
    taxPayments: [payment],
    separateReturns: h.people,
  }

  it('shows the household as both returns added together', () => {
    const m = buildOverview(input, 'household')
    expect(m.filing).toBe('separate')
    expect(m.liability.federal).toBe(h.federal)
    expect(m.liability.ca).toBe(h.ca)
    expect(m.allocation).toBeNull()
  })

  it('shows a person their own return, with half the joint estimated payments and no allocation', () => {
    const marc = buildOverview(input, 'marc')
    const mae = buildOverview(input, 'mae')
    expect(mae.liability.federal).toBe(h.people!.mae.federal)
    expect(mae.liability.ca).toBe(h.people!.mae.ca)
    expect(mae.allocation).toBeNull()
    expect(marc.jointPayments.federal).toBe(cents(500.01))
    expect(mae.jointPayments.federal).toBe(cents(500))
    expect(mae.payments.federal).toBe(cents(500)) // the test paystubs withhold no federal tax
    expect(marc.refund.total + mae.refund.total).toBe(buildOverview(input, 'household').refund.total)
  })
})
