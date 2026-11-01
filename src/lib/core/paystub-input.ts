import { benefitsTotal } from './payroll'
import type { Cents } from './money'
import type { IsoDate, PayrollRecord, PaystubBenefits } from './types'

/** What the paystub form submits (and what the server action re-validates). Money in cents. */
export interface PaystubInput {
  /** Present when editing. */
  id?: string
  taxpayerId: string
  employer: string
  payDate: IsoDate
  paidOut: boolean
  gross: Cents
  benefits: PaystubBenefits
  gtli: Cents
  employerHsa: Cents
  federalWithholding: Cents
  caWithholding: Cents
  socialSecurity: Cents
  medicare: Cents
  caSdi: Cents
  notes?: string
}

export type PaystubValidation = { ok: true; fields: Omit<PayrollRecord, 'id' | 'createdAt' | 'updatedAt'> } | { ok: false; error: string }

const isCents = (n: unknown): n is Cents => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0

/** Checks a submitted paystub and turns it into record fields. Never trusts the client. */
export function validatePaystub(input: PaystubInput, knownTaxpayerIds: string[], knownYears: number[]): PaystubValidation {
  if (!knownTaxpayerIds.includes(input.taxpayerId)) return { ok: false, error: 'Unknown person.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.payDate) || Number.isNaN(Date.parse(input.payDate))) return { ok: false, error: 'Enter a valid pay date.' }
  const taxYear = Number(input.payDate.slice(0, 4))
  if (!knownYears.includes(taxYear)) return { ok: false, error: `Tax year ${taxYear} isn't set up yet.` }

  const amounts = [
    input.gross,
    input.gtli,
    input.employerHsa,
    input.federalWithholding,
    input.caWithholding,
    input.socialSecurity,
    input.medicare,
    input.caSdi,
    ...Object.values(input.benefits ?? {}),
  ]
  if (!amounts.every(isCents) || Object.keys(input.benefits ?? {}).length !== 7) return { ok: false, error: 'Amounts must be zero or more.' }
  if (input.gross <= 0) return { ok: false, error: 'Enter the gross pay.' }

  const preTax = benefitsTotal(input.benefits)
  if (preTax > input.gross) return { ok: false, error: 'Pre-tax deductions are more than gross pay.' }

  return {
    ok: true,
    fields: {
      taxYear,
      taxpayerId: input.taxpayerId,
      employer: input.employer.trim(),
      payDate: input.payDate,
      status: input.paidOut ? 'actual' : 'projected',
      gross: input.gross,
      preTax,
      federalWithholding: input.federalWithholding,
      caWithholding: input.caWithholding,
      socialSecurity: input.socialSecurity,
      medicare: input.medicare,
      caSdi: input.caSdi,
      benefits: input.benefits,
      gtli: input.gtli,
      employerHsa: input.employerHsa,
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    },
  }
}
