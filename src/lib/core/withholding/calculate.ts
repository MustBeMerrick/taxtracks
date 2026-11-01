import { applyRate, cents, type Cents } from '../money'
import { getWithholdingRules } from './rules'
import {
  PERIODS_PER_YEAR,
  type CaRateRow,
  type CaStatusAmounts,
  type PerPeriod,
  type SalaryPaycheckInput,
  type SalaryPaycheckResult,
  type TraceLine,
  type TraceSection,
  type WithholdingRules,
} from './types'

/** Row with the largest `over` that is ≤ amount (tables are ascending). Amount and table both in dollars. */
function findRow<T extends { over: number }>(rows: T[], amountDollars: number): T {
  let match = rows[0]
  for (const row of rows) {
    if (amountDollars >= row.over) match = row
    else break
  }
  return match
}

const money = (ref: string, label: string, value: Cents): TraceLine => ({ ref, label, value, kind: 'money' })
const rate = (ref: string, label: string, value: number): TraceLine => ({ ref, label, value, kind: 'rate' })
const count = (ref: string, label: string, value: number): TraceLine => ({ ref, label, value, kind: 'number' })

function roundCents(value: number): Cents {
  return Math.sign(value) * Math.round(Math.abs(value))
}

/** Allowance tables list 1..10 (or 0..10); beyond 10 the EDD says multiply the one-allowance amount. */
function allowanceAmount(rows: PerPeriod[], firstRowAllowances: 0 | 1, n: number, period: keyof PerPeriod): number {
  if (n <= 0) return 0
  const maxListed = rows.length - 1 + firstRowAllowances
  if (n <= maxListed) return rows[n - firstRowAllowances][period]
  return rows[1 - firstRowAllowances][period] * n
}

// ── Federal: Pub 15-T Worksheet 1A (Form W-4 from 2020 or later) ────────────────────────

function federalIncomeTax(
  input: SalaryPaycheckInput,
  rules: WithholdingRules,
  wages: Cents,
): { amount: Cents; section: TraceSection } {
  const f = input.federal
  const periods = PERIODS_PER_YEAR[input.payFrequency]
  const section: TraceSection = {
    title: 'Federal income tax',
    source: `IRS Pub 15-T (${rules.taxYear}) — Worksheet 1A, Annual Percentage Method`,
    lines: [],
  }
  const L = section.lines

  const annualWages = wages * periods
  const step1g = cents(f.filingStatus === 'mfj' ? rules.federal.step1gAllowance.mfj : rules.federal.step1gAllowance.other)
  const line1g = f.step2Checkbox ? 0 : step1g
  const adjusted = Math.max(0, annualWages + f.step4aOtherIncome - (f.step4bDeductions + line1g))

  L.push(
    money('1a', 'Taxable wages this period', wages),
    count('1b', 'Pay periods per year', periods),
    money('1c', 'Annualized wages', annualWages),
    money('1d', 'W-4 Step 4(a) other income', f.step4aOtherIncome),
    money('1f', 'W-4 Step 4(b) deductions', f.step4bDeductions),
    money('1g', f.step2Checkbox ? 'Standard allowance (Step 2 box checked → none)' : 'Standard allowance', line1g),
    money('1i', 'Adjusted Annual Wage Amount', adjusted),
  )

  const table = rules.federal.tables[f.step2Checkbox ? 'step2Checkbox' : 'standard'][f.filingStatus]
  const row = findRow(table, adjusted / 100)
  const annualTentative = cents(row.base) + row.rate * (adjusted - cents(row.over))
  const tentative = annualTentative / periods
  const creditPerPeriod = f.step3Credits / periods
  const afterCredits = Math.max(0, tentative - creditPerPeriod)
  const amount = roundCents(afterCredits + f.step4cExtra)

  L.push(
    money('2b', 'Bracket starts at', cents(row.over)),
    money('2c', 'Bracket base tax', cents(row.base)),
    rate('2d', 'Bracket rate', row.rate),
    money('2g', 'Tentative annual withholding', roundCents(annualTentative)),
    money('2h', 'Tentative withholding per period', roundCents(tentative)),
    money('3b', 'W-4 Step 3 credits per period', roundCents(creditPerPeriod)),
    money('3c', 'After credits', roundCents(afterCredits)),
    money('4a', 'W-4 Step 4(c) extra per period', f.step4cExtra),
    money('4b', 'Federal income tax to withhold', amount),
  )
  return { amount, section }
}

// ── California: EDD Method B (exact calculation) ────────────────────────────────────────

function statusColumn(table: CaStatusAmounts, input: SalaryPaycheckInput): PerPeriod {
  const ca = input.california
  if (ca.filingStatus === 'single') return table.single
  if (ca.filingStatus === 'hoh') return table.hoh
  return ca.regularAllowances >= 2 ? table.marriedHigh : table.marriedLow
}

function californiaIncomeTax(
  input: SalaryPaycheckInput,
  rules: WithholdingRules,
  wages: Cents,
): { amount: Cents; section: TraceSection } {
  const ca = input.california
  const p = input.payFrequency
  const t = rules.california
  const section: TraceSection = {
    title: 'California income tax',
    source: `EDD ${rules.taxYear} Withholding Schedules — Method B (exact calculation)`,
    lines: [],
  }
  const L = section.lines

  const lowIncome = cents(statusColumn(t.lowIncomeExemption, input)[p])
  L.push(
    money('Wages', 'California taxable wages this period', wages),
    money('Step 1 · Table 1', 'Low income exemption', lowIncome),
  )
  if (wages <= lowIncome) {
    L.push(money('Result', 'Wages at or below the exemption — nothing withheld', 0))
    return { amount: roundCents(ca.additionalWithholding), section: addExtra(section, ca.additionalWithholding) }
  }

  const estimated = cents(allowanceAmount(t.estimatedDeduction, 1, ca.estimatedDeductionAllowances, p))
  const afterEstimated = wages - estimated
  const standard = cents(statusColumn(t.standardDeduction, input)[p])
  const taxableIncome = Math.max(0, afterEstimated - standard)
  L.push(
    count('Step 2', 'Estimated-deduction allowances', ca.estimatedDeductionAllowances),
    money('Step 2 · Table 2', 'Estimated deduction', estimated),
    money('Step 3 · Table 3', 'Standard deduction', standard),
    money('Step 3', 'Taxable income', taxableIncome),
  )

  const row: CaRateRow = findRow(t.rateTables[p][ca.filingStatus], taxableIncome / 100)
  const computed = cents(row.base) + row.rate * (taxableIncome - cents(row.over))
  const credit = cents(allowanceAmount(t.exemptionAllowance, 0, ca.regularAllowances, p))
  const tax = roundCents(Math.max(0, computed - credit))
  L.push(
    money('Step 4 · Tables 5–28', 'Bracket starts at', cents(row.over)),
    rate('Step 4', 'Bracket rate', row.rate),
    money('Step 4', 'Bracket base tax', cents(row.base)),
    money('Step 4', 'Computed tax', roundCents(computed)),
    count('Step 5', 'Regular allowances', ca.regularAllowances),
    money('Step 5 · Table 4', 'Exemption allowance credit', credit),
    money('Step 5', 'Tax after credit', tax),
  )
  return { amount: tax + ca.additionalWithholding, section: addExtra(section, ca.additionalWithholding, tax) }
}

function addExtra(section: TraceSection, extra: Cents, tax: Cents = 0): TraceSection {
  section.lines.push(
    money('DE 4', 'Additional withholding per period', extra),
    money('Total', 'California income tax to withhold', tax + extra),
  )
  return section
}

// ── FICA and SDI ────────────────────────────────────────────────────────────────────────

function fica(input: SalaryPaycheckInput, rules: WithholdingRules, ficaWages: Cents) {
  const r = rules.fica
  const ytd = input.ytdFicaWages ?? 0
  const f = input.federal

  const ssRoom = Math.max(0, cents(r.socialSecurityWageBase) - ytd)
  const ssWages = f.exemptFromSocialSecurity ? 0 : Math.min(ficaWages, ssRoom)
  const socialSecurity = applyRate(ssWages, r.socialSecurityRate)

  const medicare = f.exemptFromMedicare ? 0 : applyRate(ficaWages, r.medicareRate)
  const overThreshold = Math.max(0, Math.min(ficaWages, ytd + ficaWages - cents(r.additionalMedicareThreshold)))
  const additionalMedicare = f.exemptFromMedicare ? 0 : applyRate(overThreshold, r.additionalMedicareRate)

  const section: TraceSection = {
    title: 'Social Security & Medicare',
    source: `Pub 15 / SSA ${rules.taxYear} wage base`,
    lines: [
      money('Wages', 'FICA wages this period', ficaWages),
      money('YTD', 'FICA wages already paid this year', ytd),
      money('SS', `Wages subject to Social Security (base ${r.socialSecurityWageBase.toLocaleString('en-US')})`, ssWages),
      rate('SS', 'Social Security rate', r.socialSecurityRate),
      money('SS', 'Social Security', socialSecurity),
      rate('Medicare', 'Medicare rate', r.medicareRate),
      money('Medicare', 'Medicare', medicare),
      money('Addl', `Wages over $${r.additionalMedicareThreshold.toLocaleString('en-US')} this year`, overThreshold),
      money('Addl', 'Additional Medicare (0.9%)', additionalMedicare),
    ],
  }
  return { socialSecurity, medicare, additionalMedicare, section }
}

function sdi(input: SalaryPaycheckInput, rules: WithholdingRules, sdiWages: Cents) {
  const amount = input.california.exemptFromSdi ? 0 : applyRate(sdiWages, rules.california.sdiRate)
  const section: TraceSection = {
    title: 'California SDI',
    source: `EDD DE 44 (${rules.taxYear}) — no wage ceiling`,
    lines: [
      money('Wages', 'SDI wages this period', sdiWages),
      rate('SDI', 'SDI rate', rules.california.sdiRate),
      money('SDI', 'California SDI', amount),
    ],
  }
  return { amount, section }
}

// ── Entry point ─────────────────────────────────────────────────────────────────────────

/**
 * Wage bases (how each benefit is treated — matches real ADP stubs):
 *  - Federal income tax: gross − Section 125 (health, FSA) − HSA − 401(k) + GTLI
 *  - Social Security / Medicare: same, but 401(k) deferrals stay in
 *  - CA income tax: gross − Section 125 − 401(k) + GTLI + employer HSA  (CA does NOT exclude HSA)
 *  - CA SDI: gross − Section 125 + employer HSA  (HSA and 401(k) stay in; GTLI is not SDI wages)
 */
export function calculateSalaryPaycheck(input: SalaryPaycheckInput): SalaryPaycheckResult {
  const rules = getWithholdingRules(input.taxYear)
  const b = input.benefits
  const gross = input.grossPerPeriod

  const section125 = b.medical + b.dental + b.vision + b.healthcareFsa + b.dependentFsa

  const federalWages = Math.max(0, gross - section125 - b.hsa - b.retirementPreTax + b.gtliImputed)
  const ficaWages = Math.max(0, gross - section125 - b.hsa + b.gtliImputed)
  const caWages = Math.max(0, gross - section125 - b.retirementPreTax + b.gtliImputed + b.hsaEmployer)
  const sdiWages = Math.max(0, gross - section125 + b.hsaEmployer)

  const fed = input.federal.exemptFromIncomeTax
    ? { amount: 0, section: exemptSection('Federal income tax') }
    : federalIncomeTax(input, rules, federalWages)
  const ca = input.california.exemptFromIncomeTax
    ? { amount: 0, section: exemptSection('California income tax') }
    : californiaIncomeTax(input, rules, caWages)
  const f = fica(input, rules, ficaWages)
  const s = sdi(input, rules, sdiWages)

  const benefitDeductions = section125 + b.hsa + b.retirementPreTax
  const totalTaxes = fed.amount + f.socialSecurity + f.medicare + f.additionalMedicare + ca.amount + s.amount

  return {
    gross,
    benefitDeductions,
    wages: { federal: federalWages, fica: ficaWages, californiaIncomeTax: caWages, sdi: sdiWages },
    withholding: {
      federalIncomeTax: fed.amount,
      socialSecurity: f.socialSecurity,
      medicare: f.medicare,
      additionalMedicare: f.additionalMedicare,
      californiaIncomeTax: ca.amount,
      californiaSdi: s.amount,
    },
    totalTaxes,
    netPay: gross - benefitDeductions - totalTaxes,
    trace: [fed.section, f.section, ca.section, s.section],
  }
}

function exemptSection(title: string): TraceSection {
  return { title, source: 'Employee claims exemption', lines: [money('Result', 'Exempt — nothing withheld', 0)] }
}
