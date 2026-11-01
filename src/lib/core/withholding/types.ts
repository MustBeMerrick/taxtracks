import type { Cents } from '../money'

export type PayFrequency =
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'daily'

/** Most frequent first (the order shown in the drop-down). */
export const PAY_FREQUENCIES: readonly PayFrequency[] = [
  'daily',
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
]

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every two weeks',
  semimonthly: 'Semi Monthly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiannual: 'Twice a year',
  annual: 'Annually',
  daily: 'Daily',
}

/** Pub 15-T Table 3 (daily = 260). */
export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  annual: 1,
  daily: 260,
}

/** Federal rate row, dollars as published: tentative annual = base + rate × (wage − over). */
export interface FedRateRow {
  over: number
  rate: number
  base: number
}

/** California rate row, dollars as published: tax = base + rate × (income − over). */
export interface CaRateRow {
  over: number
  rate: number
  base: number
}

export type FedFilingStatus = 'single' | 'mfj' | 'hoh'
/** DE 4 statuses: "Single, or married with two or more incomes", "Married (one income)", "Head of household". */
export type CaFilingStatus = 'single' | 'married' | 'hoh'

/** Per-pay-period amounts keyed by frequency, in dollars as published. */
export type PerPeriod = Record<PayFrequency, number>

export interface CaStatusAmounts {
  single: PerPeriod
  /** DE 4 allowances '0' or '1'. */
  marriedLow: PerPeriod
  /** DE 4 allowances '2' or more. */
  marriedHigh: PerPeriod
  hoh: PerPeriod
}

export interface WithholdingRules {
  taxYear: number
  federal: {
    /** Worksheet 1A line 1g. */
    step1gAllowance: { mfj: number; other: number }
    tables: Record<'standard' | 'step2Checkbox', Record<FedFilingStatus, FedRateRow[]>>
  }
  /** Annual contribution limits (employee elective deferrals / pre-tax benefits). */
  limits: {
    /** 401(k)/403(b) employee deferral, before age-50 catch-up. */
    retirementDeferral: number
    healthcareFsa: number
    dependentCareFsa: number
    /** Family coverage, before the age-55 catch-up; includes employer contributions. */
    hsaFamily: number
  }
  fica: {
    socialSecurityRate: number
    socialSecurityWageBase: number
    medicareRate: number
    additionalMedicareRate: number
    additionalMedicareThreshold: number
  }
  california: {
    sdiRate: number
    /** Method B Table 1. */
    lowIncomeExemption: CaStatusAmounts
    /** Method B Table 2: rows for 1..10 additional allowances. */
    estimatedDeduction: PerPeriod[]
    /** Method B Table 3. */
    standardDeduction: CaStatusAmounts
    /** Method B Table 4: rows for 0..10 allowances. */
    exemptionAllowance: PerPeriod[]
    /** Method B Tables 5–28. */
    rateTables: Record<PayFrequency, Record<CaFilingStatus, CaRateRow[]>>
  }
}

/** Inputs, all money in cents. */
export interface SalaryPaycheckInput {
  taxYear: number
  payFrequency: PayFrequency
  /** Gross salary for ONE pay period. */
  grossPerPeriod: Cents
  /** FICA wages already paid this year before this paycheck (Social Security cap, Additional Medicare). */
  ytdFicaWages?: Cents
  federal: {
    filingStatus: FedFilingStatus
    /** W-4 Step 2(c) checkbox. */
    step2Checkbox: boolean
    /** W-4 Step 3 annual credits (dependents etc.). */
    step3Credits: Cents
    /** W-4 Step 4(a) other income, annual. */
    step4aOtherIncome: Cents
    /** W-4 Step 4(b) deductions, annual. */
    step4bDeductions: Cents
    /** W-4 Step 4(c) extra withholding, per pay period. */
    step4cExtra: Cents
    exemptFromIncomeTax?: boolean
    exemptFromSocialSecurity?: boolean
    exemptFromMedicare?: boolean
  }
  california: {
    filingStatus: CaFilingStatus
    regularAllowances: number
    estimatedDeductionAllowances: number
    /** Additional withholding per pay period (DE 4 line 3). */
    additionalWithholding: Cents
    exemptFromIncomeTax?: boolean
    exemptFromSdi?: boolean
  }
  /** Per-pay-period amounts. */
  benefits: {
    /** Medical, dental, vision premiums (Section 125). */
    medical: Cents
    dental: Cents
    vision: Cents
    healthcareFsa: Cents
    dependentFsa: Cents
    /** Excluded from federal and FICA wages, but CA taxes it. */
    hsa: Cents
    /** Employer HSA contribution: not federal/FICA wages, but CA taxes it (income tax and SDI). Not cash. */
    hsaEmployer: Cents
    /** Traditional 401(k) / 403(b) deferral. */
    retirementPreTax: Cents
    /** Imputed income for group-term life over $50k: taxable, not cash. */
    gtliImputed: Cents
  }
}

export interface TraceLine {
  /** Worksheet / table line reference, e.g. "1c" or "Table 3". */
  ref: string
  label: string
  /** Money in cents, rate as fraction, or a plain number — see `kind`. */
  value: number
  kind: 'money' | 'rate' | 'number'
}

export interface TraceSection {
  title: string
  source: string
  lines: TraceLine[]
}

export interface SalaryPaycheckResult {
  gross: Cents
  /** Pre-tax benefit deductions leaving the paycheck (not GTLI). */
  benefitDeductions: Cents
  wages: { federal: Cents; fica: Cents; californiaIncomeTax: Cents; sdi: Cents }
  withholding: {
    federalIncomeTax: Cents
    socialSecurity: Cents
    medicare: Cents
    additionalMedicare: Cents
    californiaIncomeTax: Cents
    californiaSdi: Cents
  }
  totalTaxes: Cents
  netPay: Cents
  trace: TraceSection[]
}
