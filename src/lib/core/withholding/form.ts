import { cents, type Cents } from '../money'
import { PERIODS_PER_YEAR } from './types'
import type { CaFilingStatus, FedFilingStatus, PayFrequency, SalaryPaycheckInput } from './types'

/** Raw calculator form: every field is what the user typed, so partial input never loses state. */
export interface PaycheckForm {
  payFrequency: PayFrequency
  payMethod: 'perYear' | 'perPaycheck'
  salary: string
  /** ISO date; its year selects the tax-year rule set. */
  payDate: string
  ytdFicaWages: string

  fedFilingStatus: FedFilingStatus
  /** W-4 Step 2(c): two jobs, or spouse works. */
  multipleJobs: boolean
  step3Credits: string
  step4aOtherIncome: string
  step4bDeductions: string
  step4cExtra: string
  exemptFederal: boolean
  exemptSocialSecurity: boolean
  exemptMedicare: boolean

  caFilingStatus: CaFilingStatus
  caRegularAllowances: string
  caEstimatedAllowances: string
  caAdditional: string
  exemptCaIncomeTax: boolean
  exemptSdi: boolean

  medical: string
  dental: string
  vision: string
  healthcareFsa: string
  dependentFsa: string
  hsa: string
  hsaEmployer: string
  gtli: string
  retirementType: 'percent' | 'amount'
  retirement: string
}

export function defaultForm(payDate: string): PaycheckForm {
  return {
    payFrequency: 'semimonthly',
    payMethod: 'perYear',
    salary: '',
    payDate,
    ytdFicaWages: '',
    fedFilingStatus: 'mfj',
    multipleJobs: false,
    step3Credits: '',
    step4aOtherIncome: '',
    step4bDeductions: '',
    step4cExtra: '',
    exemptFederal: false,
    exemptSocialSecurity: false,
    exemptMedicare: false,
    caFilingStatus: 'single',
    caRegularAllowances: '',
    caEstimatedAllowances: '',
    caAdditional: '',
    exemptCaIncomeTax: false,
    exemptSdi: false,
    medical: '',
    dental: '',
    vision: '',
    healthcareFsa: '',
    dependentFsa: '',
    hsa: '',
    hsaEmployer: '',
    gtli: '',
    retirementType: 'percent',
    retirement: '',
  }
}

/** Live input formatting: digits and one decimal point only, commas every 3 integer digits
 * ("1234567.5" → "1,234,567.5"), and a leading zero when the value starts with the decimal point (".5" → "0.5"). */
export function formatNumberInput(text: string, maxDecimals?: number): string {
  const cleaned = text.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  let integer = dot === -1 ? cleaned : cleaned.slice(0, dot)
  if (dot !== -1 && integer === '') integer = '0'
  let decimals = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, '')
  if (decimals !== null && maxDecimals !== undefined) decimals = decimals.slice(0, maxDecimals)
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return decimals === null ? grouped : `${grouped}.${decimals}`
}

/** Finished dollar amount: always two decimals ("5" → "5.00", "1234.5" → "1,234.50"); empty stays empty. */
export function formatDollars(text: string): string {
  const grouped = formatNumberInput(text, 2)
  if (grouped === '') return ''
  const [integer, decimals = ''] = grouped.split('.')
  return `${integer}.${decimals.padEnd(2, '0')}`
}

/** Dollars as typed ("$1,234.50", "", "12") → cents; null when not a non-negative number. */
export function parseMoney(text: string): Cents | null {
  const cleaned = text.replace(/[$,\s]/g, '')
  if (cleaned === '') return 0
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return null
  return cents(Number(cleaned))
}

function parseCount(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim()
  if (cleaned === '') return 0
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null
}

function parsePercent(text: string): number | null {
  const cleaned = text.replace(/[%,\s]/g, '')
  if (cleaned === '') return 0
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '.') return null
  const value = Number(cleaned)
  return value <= 100 ? value : null
}

export type FormErrors = Partial<Record<keyof PaycheckForm, string>>

export type FormResult =
  | { ok: true; input: SalaryPaycheckInput; errors: FormErrors }
  | { ok: false; input: null; errors: FormErrors }

const MONEY_ERROR = 'Enter a dollar amount'

export function formToInput(form: PaycheckForm): FormResult {
  const errors: FormErrors = {}

  const money = (key: keyof PaycheckForm): Cents => {
    const parsed = parseMoney(form[key] as string)
    if (parsed === null) {
      errors[key] = MONEY_ERROR
      return 0
    }
    return parsed
  }
  const countOf = (key: keyof PaycheckForm): number => {
    const parsed = parseCount(form[key] as string)
    if (parsed === null) {
      errors[key] = 'Enter a whole number'
      return 0
    }
    return parsed
  }

  const taxYear = Number(form.payDate.slice(0, 4))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.payDate) || !Number.isFinite(taxYear)) errors.payDate = 'Enter a pay date'

  const salary = money('salary')
  const periods = PERIODS_PER_YEAR[form.payFrequency]
  const grossPerPeriod = form.payMethod === 'perYear' ? Math.round(salary / periods) : salary

  let retirementPreTax: Cents = 0
  if (form.retirementType === 'percent') {
    const percent = parsePercent(form.retirement)
    if (percent === null) errors.retirement = 'Enter a percent from 0 to 100'
    else retirementPreTax = Math.round((grossPerPeriod * percent) / 100)
  } else {
    retirementPreTax = money('retirement')
  }

  const input: SalaryPaycheckInput = {
    taxYear,
    payFrequency: form.payFrequency,
    grossPerPeriod,
    ytdFicaWages: money('ytdFicaWages'),
    federal: {
      filingStatus: form.fedFilingStatus,
      step2Checkbox: form.multipleJobs,
      step3Credits: money('step3Credits'),
      step4aOtherIncome: money('step4aOtherIncome'),
      step4bDeductions: money('step4bDeductions'),
      step4cExtra: money('step4cExtra'),
      exemptFromIncomeTax: form.exemptFederal,
      exemptFromSocialSecurity: form.exemptSocialSecurity,
      exemptFromMedicare: form.exemptMedicare,
    },
    california: {
      filingStatus: form.caFilingStatus,
      regularAllowances: countOf('caRegularAllowances'),
      estimatedDeductionAllowances: countOf('caEstimatedAllowances'),
      additionalWithholding: money('caAdditional'),
      exemptFromIncomeTax: form.exemptCaIncomeTax,
      exemptFromSdi: form.exemptSdi,
    },
    benefits: {
      medical: money('medical'),
      dental: money('dental'),
      vision: money('vision'),
      healthcareFsa: money('healthcareFsa'),
      dependentFsa: money('dependentFsa'),
      hsa: money('hsa'),
      hsaEmployer: money('hsaEmployer'),
      retirementPreTax,
      gtliImputed: money('gtli'),
    },
  }

  return Object.keys(errors).length > 0 ? { ok: false, input: null, errors } : { ok: true, input, errors }
}
