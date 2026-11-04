import { describe, expect, it } from 'vitest'
import { calculateIncomeSummary, type IncomeSummaryInput } from './income-summary'
import { cents } from './money'

// Marc's spreadsheet column: reconciled to the cent (California standard deduction since updated to the FTB 2026 $5,900).
const marc: IncomeSummaryInput = {
  filingStatus: 'single',
  salary: cents(207_200.05),
  shortTermProfit: cents(28_119),
  shortTermLoss: cents(10_647.86),
  longTermProfit: cents(5_631),
  longTermLoss: 0,
  dividends: cents(5_375),
  hsa: cents(1_200),
  section125: cents(798.72),
  retirement401k: 0,
  gtli: cents(160.8),
  employerHsa: cents(1_200),
  carryoverShort: 0,
  carryoverLong: 0,
}

describe('income summary (spreadsheet column)', () => {
  const s = calculateIncomeSummary(2026, marc)!

  it('reproduces every row', () => {
    expect(s.baseSalary).toBe(cents(207_200.05))
    expect(s.netShortTerm).toBe(cents(17_471.14))
    expect(s.netLongTerm).toBe(cents(5_631))
    expect(s.grossRealized).toBe(cents(246_325.05)) // profits only, losses ignored
    expect(s.ordinaryIncome).toBe(cents(230_046.19))
    expect(s.ltcgIncome).toBe(cents(5_631))
    expect(s.capitalLossAllowed).toBe(0)
    expect(s.federalStandardDeduction).toBe(cents(16_100))
    expect(s.stateStandardDeduction).toBe(cents(5_900))
    expect(s.federalOrdinaryTaxable).toBe(cents(212_108.27))
    expect(s.stateTaxable).toBe(cents(230_339.27))
    expect(s.capitalLossCarryForward).toBe(0)
  })

  it('uses the married standard deductions for a joint column', () => {
    const joint = calculateIncomeSummary(2026, { ...marc, filingStatus: 'mfj', salary: cents(376_716.77) })!
    expect(joint.ordinaryIncome).toBe(cents(399_562.91))
    expect(joint.federalStandardDeduction).toBe(cents(32_200))
    expect(joint.stateStandardDeduction).toBe(cents(11_800))
  })
})

describe('capital losses', () => {
  const base: IncomeSummaryInput = { ...marc, shortTermProfit: 0, shortTermLoss: 0, longTermProfit: 0, longTermLoss: 0, dividends: 0 }

  it('allows only $3,000 against ordinary income and carries the rest forward', () => {
    const s = calculateIncomeSummary(2026, { ...base, shortTermLoss: cents(10_000) })!
    expect(s.capitalLossAllowed).toBe(cents(3_000))
    expect(s.capitalLossCarryForward).toBe(cents(7_000))
    expect(s.ordinaryIncome).toBe(base.salary) // a loss never makes ordinary income negative
    expect(s.federalOrdinaryTaxable).toBe(base.salary - base.hsa - base.section125 + base.gtli - cents(16_100) - cents(3_000))
  })

  it('nets a short-term loss against a long-term gain, and a long-term loss against a short-term gain', () => {
    const a = calculateIncomeSummary(2026, { ...base, shortTermLoss: cents(2_000), longTermProfit: cents(5_000) })!
    expect([a.ltcgIncome, a.ordinaryIncome - base.salary]).toEqual([cents(3_000), 0])
    const b = calculateIncomeSummary(2026, { ...base, shortTermProfit: cents(5_000), longTermLoss: cents(2_000) })!
    expect([b.ltcgIncome, b.ordinaryIncome - base.salary]).toEqual([0, cents(3_000)])
  })

  it('applies carried-over losses first, keeping their character', () => {
    const s = calculateIncomeSummary(2026, { ...base, longTermProfit: cents(4_000), carryoverLong: cents(1_500) })!
    expect(s.ltcgIncome).toBe(cents(2_500))
    expect(s.carriedOver).toBe(cents(1_500))
  })

  it('is null for a year without rules', () => {
    expect(calculateIncomeSummary(2030, base)).toBeNull()
  })
})
