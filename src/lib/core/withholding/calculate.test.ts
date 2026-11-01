import { describe, expect, it } from 'vitest'
import { cents } from '../money'
import { calculateSalaryPaycheck } from './calculate'
import { UnsupportedTaxYearError, getWithholdingRules } from './rules'
import type { CaFilingStatus, PayFrequency, SalaryPaycheckInput } from './types'

const NO_BENEFITS = {
  medical: 0,
  dental: 0,
  vision: 0,
  healthcareFsa: 0,
  dependentFsa: 0,
  hsa: 0,
  hsaEmployer: 0,
  retirementPreTax: 0,
  gtliImputed: 0,
}

function input(overrides: Partial<SalaryPaycheckInput> = {}): SalaryPaycheckInput {
  return {
    taxYear: 2026,
    payFrequency: 'semimonthly',
    grossPerPeriod: cents(5000),
    federal: {
      filingStatus: 'single',
      step2Checkbox: false,
      step3Credits: 0,
      step4aOtherIncome: 0,
      step4bDeductions: 0,
      step4cExtra: 0,
    },
    california: {
      filingStatus: 'single',
      regularAllowances: 0,
      estimatedDeductionAllowances: 0,
      additionalWithholding: 0,
    },
    benefits: { ...NO_BENEFITS },
    ...overrides,
  }
}

/** Real semi-monthly pay stub (Marc, Oct 2026). W-4: MFJ, Step 2 box checked, 4(a) $1,000, 4(c) $4. */
const STUB = input({
  grossPerPeriod: cents(9185.42),
  ytdFicaWages: cents(168_927),
  federal: {
    ...input().federal,
    filingStatus: 'mfj',
    step2Checkbox: true,
    step4aOtherIncome: cents(1000),
    step4cExtra: cents(4),
  },
  california: {
    filingStatus: 'single',
    regularAllowances: 4,
    estimatedDeductionAllowances: 4,
    additionalWithholding: cents(10),
  },
  benefits: {
    ...NO_BENEFITS,
    dental: cents(3.42),
    hsa: cents(50),
    // Employer HSA contribution (confirmed by Marc): taxable in CA, not shown on the stub. Without it the
    // stub's CA income tax and SDI don't reconcile.
    hsaEmployer: cents(50),
    medical: cents(29.51),
    vision: cents(0.35),
    gtliImputed: cents(6.7),
  },
})

describe('pay stub fixture (semi-monthly, CA)', () => {
  const r = calculateSalaryPaycheck(STUB)

  it('derives the stub wage bases', () => {
    expect(r.wages.federal).toBe(cents(9108.84)) // "federal taxable wages this period"
    expect(r.wages.fica).toBe(cents(9108.84))
    expect(r.wages.californiaIncomeTax).toBe(cents(9208.84))
    expect(r.wages.sdi).toBe(cents(9202.14)) // GTLI is not SDI wages
  })

  it('matches FICA and SDI exactly', () => {
    expect(r.withholding.socialSecurity).toBe(cents(564.75))
    expect(r.withholding.medicare).toBe(cents(132.08))
    expect(r.withholding.additionalMedicare).toBe(0)
    expect(r.withholding.californiaSdi).toBe(cents(119.63))
  })

  it('matches federal income tax within 3¢', () => {
    // Stub: 1,736.53; Worksheet 1A gives 1,736.50.
    expect(Math.abs(r.withholding.federalIncomeTax - cents(1736.53))).toBeLessThanOrEqual(3)
  })

  it('matches California income tax within 3¢', () => {
    // Stub: 719.38. Method B on the semi-monthly tables gives 719.35; annualizing gives 719.41. ADP's exact
    // rounding path is unknown, so allow a few cents rather than bend the EDD formula to fit one stub.
    expect(Math.abs(r.withholding.californiaIncomeTax - cents(719.38))).toBeLessThanOrEqual(3)
  })

  it('matches net pay within 6¢ (the federal and CA residuals)', () => {
    expect(r.benefitDeductions).toBe(cents(83.28))
    expect(Math.abs(r.netPay - cents(5829.77))).toBeLessThanOrEqual(6)
  })
})

describe('federal (Pub 15-T 2026 Worksheet 1A)', () => {
  it('single, standard schedule', () => {
    // 5,000 × 24 = 120,000 − 8,600 = 111,400 → 22% row: 5,800 + 0.22 × (111,400 − 57,900) = 17,570 / 24
    const r = calculateSalaryPaycheck(input())
    expect(r.withholding.federalIncomeTax).toBe(cents(732.08))
  })

  it('MFJ uses the $12,900 allowance and MFJ schedule', () => {
    // 120,000 − 12,900 = 107,100 → 12% row: 2,480 + 0.12 × (107,100 − 44,100) = 10,040 / 24
    const r = calculateSalaryPaycheck(input({ federal: { ...input().federal, filingStatus: 'mfj' } }))
    expect(r.withholding.federalIncomeTax).toBe(cents(418.33))
  })

  it('Step 2 checkbox drops the allowance and uses the checkbox schedule', () => {
    // Single checkbox schedule, no allowance: 120,000 falls in the 108,938 row (32%).
    // 20,512 + 0.32 × (120,000 − 108,938) = 24,051.84 / 24
    const r = calculateSalaryPaycheck(input({ federal: { ...input().federal, step2Checkbox: true } }))
    expect(r.withholding.federalIncomeTax).toBe(cents(1002.16))
  })

  it('credits reduce withholding but never below zero; extra is added after', () => {
    const base = input({ grossPerPeriod: cents(1000) })
    const none = calculateSalaryPaycheck(base)
    const credits = calculateSalaryPaycheck({ ...base, federal: { ...base.federal, step3Credits: cents(1_000_000) } })
    expect(none.withholding.federalIncomeTax).toBeGreaterThan(0)
    expect(credits.withholding.federalIncomeTax).toBe(0)
    const extra = calculateSalaryPaycheck({
      ...base,
      federal: { ...base.federal, step3Credits: cents(1_000_000), step4cExtra: cents(25) },
    })
    expect(extra.withholding.federalIncomeTax).toBe(cents(25))
  })

  it('exempt employees have no federal income tax', () => {
    const r = calculateSalaryPaycheck(input({ federal: { ...input().federal, exemptFromIncomeTax: true } }))
    expect(r.withholding.federalIncomeTax).toBe(0)
  })
})

describe('California Method B (EDD 2026 worked examples)', () => {
  function ca(frequency: PayFrequency, gross: number, status: CaFilingStatus, regular: number, estimated = 0) {
    return calculateSalaryPaycheck(
      input({
        payFrequency: frequency,
        grossPerPeriod: cents(gross),
        california: {
          filingStatus: status,
          regularAllowances: regular,
          estimatedDeductionAllowances: estimated,
          additionalWithholding: 0,
        },
      }),
    ).withholding.californiaIncomeTax
  }

  it('A: weekly $210 is below the low-income exemption', () => {
    expect(ca('weekly', 210, 'single', 1)).toBe(0)
  })
  it('B: biweekly $1,600 married, 3 allowances (1 estimated)', () => {
    expect(ca('biweekly', 1600, 'married', 2, 1)).toBe(cents(2.38))
  })
  it('C: monthly $5,100 married, 5 allowances', () => {
    expect(ca('monthly', 5100, 'married', 5)).toBe(cents(0.82))
  })
  it('D: weekly $950 head of household, 3 allowances', () => {
    expect(ca('weekly', 950, 'hoh', 3)).toBe(cents(1.69))
  })
  it('E: semi-monthly $2,400 married, 4 allowances (annualized example: $4.13)', () => {
    expect(Math.abs(ca('semimonthly', 2400, 'married', 4) - cents(4.13))).toBeLessThanOrEqual(2)
  })
  it('F: monthly $4,750 married, 4 allowances (annualized example: $7.17)', () => {
    expect(Math.abs(ca('monthly', 4750, 'married', 4) - cents(7.17))).toBeLessThanOrEqual(2)
  })
})

describe('FICA edge cases', () => {
  it('Social Security stops at the wage base', () => {
    const r = calculateSalaryPaycheck(input({ grossPerPeriod: cents(10_000), ytdFicaWages: cents(180_000) }))
    // Only 4,500 of room left under 184,500.
    expect(r.withholding.socialSecurity).toBe(cents(279))
  })

  it('Additional Medicare applies only to wages over $200k', () => {
    const r = calculateSalaryPaycheck(input({ grossPerPeriod: cents(10_000), ytdFicaWages: cents(195_000) }))
    // 5,000 of this paycheck is above 200,000.
    expect(r.withholding.additionalMedicare).toBe(cents(45))
  })

  it('401(k) lowers income-tax wages but not FICA wages', () => {
    const r = calculateSalaryPaycheck(input({ benefits: { ...NO_BENEFITS, retirementPreTax: cents(500) } }))
    expect(r.wages.federal).toBe(cents(4500))
    expect(r.wages.fica).toBe(cents(5000))
    expect(r.wages.sdi).toBe(cents(5000))
  })
})

describe('rules', () => {
  it('fails clearly for an unsupported tax year', () => {
    expect(() => getWithholdingRules(2019)).toThrow(UnsupportedTaxYearError)
  })

  it('has 10 rows in every California rate table and ascending thresholds', () => {
    const { rateTables } = getWithholdingRules(2026).california
    for (const byStatus of Object.values(rateTables)) {
      for (const rows of Object.values(byStatus)) {
        expect(rows).toHaveLength(10)
        rows.forEach((row, i) => i > 0 && expect(row.over).toBeGreaterThan(rows[i - 1].over))
      }
    }
  })
})
