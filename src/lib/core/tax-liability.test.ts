import { describe, expect, it } from 'vitest'
import { calculateIncomeSummary, type IncomeSummaryInput } from './income-summary'
import { cents } from './money'
import { bracketTax, estimateTax } from './tax-liability'
import { getIncomeRules } from './income-rules'

const mfjBrackets = getIncomeRules(2026)!.federalBrackets.mfj!

describe('bracketTax', () => {
  it('applies each marginal rate only to its slice (2026 married filing jointly)', () => {
    expect(bracketTax(cents(24_800), mfjBrackets)).toBe(cents(2_480))
    // 10% × 24,800 + 12% × 76,000 + 22% × 110,600 + 24% × 145,034.07
    expect(bracketTax(cents(356_434.07), mfjBrackets)).toBe(cents(2_480 + 9_120 + 24_332 + 34_808.18))
    expect(bracketTax(0, mfjBrackets)).toBe(0)
  })
})

// Household column of Marc's spreadsheet (combined, married filing jointly).
const household: IncomeSummaryInput = {
  filingStatus: 'mfj',
  salary: cents(376_716.77),
  shortTermProfit: cents(28_119),
  shortTermLoss: cents(10_647.86),
  longTermProfit: cents(5_631),
  longTermLoss: 0,
  dividends: cents(5_375),
  hsa: cents(7_536), // set so federal taxable matches the sheet's 356,434.07 once perms/GTLI are applied
  section125: cents(3_000),
  retirement401k: 0,
  gtli: cents(300),
  employerHsa: cents(2_000),
  carryoverShort: 0,
  carryoverLong: 0,
}

describe('estimateTax', () => {
  const summary = calculateIncomeSummary(2026, household)!
  const est = estimateTax({ taxYear: 2026, filingStatus: 'mfj', summary, dividends: cents(5_375), medicareWages: [cents(207_000), cents(170_000)] })!

  it('taxes ordinary income by bracket and long-term gains at 15% when ordinary income is above the 0% band', () => {
    expect(est.federal.ordinaryTax).toBe(bracketTax(summary.federalOrdinaryTaxable, mfjBrackets))
    expect(est.federal.capitalGainsTax).toBe(cents(5_631 * 0.15))
  })

  it('charges 3.8% NIIT on the lesser of investment income and AGI over $250,000', () => {
    // NII = dividends 5,375 + short-term net 17,471.14 + long-term 5,631 (no loss limit used)
    expect(est.federal.netInvestmentIncome).toBe(cents(28_477.14))
    expect(est.federal.niit).toBe(cents(1_082.13))
  })

  it('owes Additional Medicare on combined wages over $250,000, less what one employer already withheld', () => {
    // owed 0.9% × (377,000 − 250,000) = 1,143.00; Marc's employer withheld 0.9% × 7,000 = 63.00
    expect(est.federal.additionalMedicare).toBe(cents(1_080))
  })

  it('sums federal and subtracts the exemption credit in California', () => {
    expect(est.federal.total).toBe(est.federal.ordinaryTax + est.federal.capitalGainsTax + est.federal.niit + est.federal.additionalMedicare)
    expect(est.california.exemptionCredit).toBe(cents(336.6))
    expect(est.california.total).toBe(est.california.tax - cents(336.6))
    expect(est.california.tax).toBeGreaterThan(0)
  })

  it('stacks capital gains inside the 0% band when ordinary income is low', () => {
    const low = calculateIncomeSummary(2026, { ...household, salary: cents(60_000), shortTermProfit: 0, shortTermLoss: 0, dividends: 0, hsa: 0, section125: 0, gtli: 0, employerHsa: 0 })!
    const e = estimateTax({ taxYear: 2026, filingStatus: 'mfj', summary: low, dividends: 0, medicareWages: [cents(60_000)] })!
    // taxable ordinary 27,800 + gains 5,631 stays under $98,900
    expect(e.federal.capitalGainsTax).toBe(0)
    expect(e.federal.niit).toBe(0)
    expect(e.federal.additionalMedicare).toBe(0)
  })

  it('is null for head of household (no verified brackets) and for a year without rules', () => {
    expect(estimateTax({ taxYear: 2026, filingStatus: 'hoh', summary, dividends: 0, medicareWages: [] })).toBeNull()
    expect(estimateTax({ taxYear: 2030, filingStatus: 'mfj', summary, dividends: 0, medicareWages: [] })).toBeNull()
  })
})
