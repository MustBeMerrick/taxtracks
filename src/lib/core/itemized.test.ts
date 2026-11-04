import { describe, expect, it } from 'vitest'
import { calculateIncomeSummary, itemizedAnnuals, type IncomeSummaryInput } from './income-summary'
import { cents } from './money'
import { estimateTax } from './tax-liability'
import type { Deduction, TaxPayment } from './types'

// The household after Mae's paystub fix (Nov 2026 audit inputs): joint wages, brokerage results and paycheck taxes.
const household: IncomeSummaryInput = {
  filingStatus: 'mfj',
  salary: cents(376_716.77),
  shortTermProfit: cents(17_466.14),
  shortTermLoss: 0,
  longTermProfit: cents(3_431),
  longTermLoss: 0,
  dividends: cents(5_375),
  hsa: cents(1_200),
  section125: cents(3_668.4),
  retirement401k: cents(6_336),
  gtli: cents(430.6),
  employerHsa: cents(1_200),
  carryoverShort: 0,
  carryoverLong: 0,
  stateIncomeTaxWithheld: cents(28_114.81),
  caSdi: cents(4_865.18),
}

describe('federal itemized deductions', () => {
  const s = calculateIncomeSummary(2026, household)!

  it('itemizes when California withholding + SDI beat the standard deduction', () => {
    expect(s.federalAgi).toBe(cents(392_215.11))
    expect(s.federalSaltAllowed).toBe(cents(32_979.99))
    expect(s.federalItemizes).toBe(true)
    expect(s.federalDeduction).toBe(cents(32_979.99))
    expect(s.federalOrdinaryTaxable).toBe(cents(392_215.11 - 3_431 - 32_979.99))
  })

  it('takes the standard deduction when itemizing is smaller', () => {
    const low = calculateIncomeSummary(2026, { ...household, stateIncomeTaxWithheld: cents(20_000), caSdi: 0 })!
    expect(low.federalItemizes).toBe(false)
    expect(low.federalDeduction).toBe(cents(32_200))
  })

  it('caps state and local taxes at $40,400', () => {
    const big = calculateIncomeSummary(2026, { ...household, propertyTax: cents(15_000) })!
    expect(big.federalSaltAllowed).toBe(cents(40_400))
  })

  it('shrinks the cap by 30% of AGI over $505,000, down to $10,000', () => {
    const extra = cents(605_000) - s.federalAgi // lift AGI to exactly $605,000
    const rich = calculateIncomeSummary(2026, { ...household, salary: household.salary + extra })!
    expect(rich.federalAgi).toBe(cents(605_000))
    expect(rich.federalSaltAllowed).toBe(cents(40_400 - 30_000))
    const richer = calculateIncomeSummary(2026, { ...household, salary: household.salary + extra + cents(200_000) })!
    expect(richer.federalSaltAllowed).toBe(cents(10_000))
  })

  it('counts charity only above 0.5% of AGI when itemizing', () => {
    const c = calculateIncomeSummary(2026, { ...household, charityCash: cents(5_000) })!
    const floor = Math.round(s.federalAgi * 0.005)
    expect(c.federalItemizedDeduction).toBe(cents(32_979.99) + cents(5_000) - floor)
  })

  it('gives a standard-deduction couple up to $2,000 of cash charity', () => {
    const base = { ...household, stateIncomeTaxWithheld: cents(10_000), caSdi: 0 }
    expect(calculateIncomeSummary(2026, { ...base, charityCash: cents(500) })!.federalDeduction).toBe(cents(32_700))
    expect(calculateIncomeSummary(2026, { ...base, charityCash: cents(9_000) })!.federalDeduction).toBe(cents(34_200))
    // Non-cash gifts only count when itemizing.
    expect(calculateIncomeSummary(2026, { ...base, charityNonCash: cents(900) })!.federalDeduction).toBe(cents(32_200))
  })

  it('uses AGI, not taxable income, for the NIIT threshold', () => {
    const e = estimateTax({ taxYear: 2026, filingStatus: 'mfj', summary: s, dividends: household.dividends, medicareWages: [] })!
    expect(e.federal.niit).toBe(Math.round((cents(17_466.14) + cents(3_431) + cents(5_375)) * 0.038))
  })
})

describe('California deductions', () => {
  it('ignores California income tax and SDI, so the standard deduction wins here', () => {
    const s = calculateIncomeSummary(2026, household)!
    expect(s.stateItemizedDeduction).toBe(0)
    expect(s.stateDeduction).toBe(cents(11_800))
    expect(s.stateTaxable).toBe(cents(382_815.11))
  })

  it('itemizes property tax, mortgage interest and charity when they beat the standard deduction, with no cap', () => {
    const s = calculateIncomeSummary(2026, { ...household, propertyTax: cents(45_000), mortgageInterest: cents(10_000), charityNonCash: cents(1_000) })!
    expect(s.stateDeduction).toBe(cents(56_000))
  })
})

describe('itemizedAnnuals', () => {
  const meta = { createdAt: '', updatedAt: '' }
  const d = (category: string, amount: number, taxYear = 2026): Deduction => ({ ...meta, id: `${category}-${taxYear}`, taxYear, owner: 'household', category, amount, status: 'manual_estimate' })
  const p = (date: string, amount: number, jurisdiction: 'ca' | 'federal' = 'ca'): TaxPayment => ({
    ...meta,
    id: date + jurisdiction,
    taxYear: Number(date.slice(0, 4)) - (date.slice(5, 7) <= '04' ? 1 : 0),
    jurisdiction,
    date,
    amount,
    kind: 'other',
    status: 'actual',
  })

  it('totals categories for the year and California payments by the date paid', () => {
    const out = itemizedAnnuals(
      2026,
      [d('property_tax', 100), d('property_tax', 50), d('charity_cash', 7), d('property_tax', 999, 2025)],
      [p('2026-04-15', 300), p('2026-06-15', 200), p('2027-01-15', 400), p('2026-04-15', 900, 'federal')],
    )
    expect(out).toEqual({ stateTaxPayments: 500, propertyTax: 150, mortgageInterest: 0, charityCash: 7, charityNonCash: 0 })
  })
})
