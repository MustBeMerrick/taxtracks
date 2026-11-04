import { describe, expect, it } from 'vitest'
import { calculateIncomeSummary, type IncomeSummaryInput } from './income-summary'
import { applyRate, cents } from './money'
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

describe('California schedule', () => {
  it('uses the statutory rates (the EDD withholding table is 110% of them)', () => {
    const rows = getIncomeRules(2026)!.californiaRates.mfj!
    expect(rows.map((r) => r.rate)).toEqual([0.01, 0.02, 0.04, 0.06, 0.08, 0.093, 0.103, 0.113, 0.123, 0.133])
    // Each base is the tax on all lower brackets, so the schedule is continuous.
    for (let i = 1; i < rows.length; i++) {
      const lower = rows[i - 1]
      expect(Math.abs(rows[i].base - (lower.base + lower.rate * (rows[i].over - lower.over)))).toBeLessThan(0.1)
    }
  })

  it('taxes joint income in the 9.3% bracket on the FTB 2026 schedule', () => {
    const s = calculateIncomeSummary(2026, household)!
    const e = estimateTax({ taxYear: 2026, filingStatus: 'mfj', summary: s, dividends: 0, medicareWages: [] })!
    expect(s.stateTaxable).toBeGreaterThan(cents(150_394))
    expect(s.stateTaxable).toBeLessThan(cents(768_218))
    const expected = 6_621.76 + 0.093 * (s.stateTaxable / 100 - 150_394)
    expect(Math.abs(e.california.tax - cents(expected))).toBeLessThan(cents(1))
  })

  it('matches the FTB 2026 bracket floors and bases, with the 1% mental health tax over $1M', () => {
    const mfj = getIncomeRules(2026)!.californiaRates.mfj!
    expect(mfj.find((r) => r.over === 150_394)).toEqual({ over: 150_394, rate: 0.093, base: 6_621.76 })
    expect(mfj.find((r) => r.over === 1_000_000)?.rate).toBe(0.123)
    expect(mfj.at(-1)).toMatchObject({ over: 1_536_426, rate: 0.133 })
    const single = getIncomeRules(2026)!.californiaRates.single!
    expect(single.find((r) => r.over === 75_197)?.rate).toBe(0.093)
    expect(single.at(-1)).toMatchObject({ over: 1_000_000, rate: 0.133 })
  })

  // Regression figures from the Nov 2026 independent audit: the 2025 schedule ($6,403.94 + 9.3% over $145,448)
  // gave $29,566.97 on $394,512.87; the 2026 schedule gives $29,324.81, and $28,070.86 on $381,029.47.
  it.each([
    [394_512.87, 29_324.81],
    [381_029.47, 28_070.86],
  ])('taxes %d of joint California taxable income at %d before credits', (income, tax) => {
    const rows = getIncomeRules(2026)!.californiaRates.mfj!
    const row = rows.filter((r) => r.over < income).at(-1)!
    expect(cents(row.base) + applyRate(cents(income) - cents(row.over), row.rate)).toBe(cents(tax))
  })

  it('uses the 2026 standard deduction and exemption credit', () => {
    const r = getIncomeRules(2026)!
    expect(r.californiaStandardDeduction.mfj).toBe(cents(11_800))
    expect(r.californiaStandardDeduction.single).toBe(cents(5_900))
    expect(r.californiaExemptionCredit.mfj).toBe(cents(316))
  })
})

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
    expect(est.california.exemptionCredit).toBe(cents(316))
    expect(est.california.total).toBe(est.california.tax - cents(316))
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
