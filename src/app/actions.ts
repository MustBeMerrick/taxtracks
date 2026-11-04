'use server'

import { cookies } from 'next/headers'
import { requireSession } from '@/lib/auth/session'
import type { FilingStatus } from '@/lib/core/filing-status'
import { FILING_STATUS_LABELS } from '@/lib/core/filing-status'
import { buildOverview } from '@/lib/core/overview'
import type { Cents } from '@/lib/core/money'
import { DEDUCTION_CATEGORIES, type DeductionCategory } from '@/lib/core/income-summary'
import { investmentId, matchingEntries, validateInvestmentEntry, type InvestmentEntryInput } from '@/lib/core/investments'
import { benefitsTotal } from '@/lib/core/payroll'
import type { PaystubBenefits } from '@/lib/core/types'
import { validatePaystub, type PaystubInput } from '@/lib/core/paystub-input'
import { ALLOCATION_COOKIE, getRepository, selectedYear, YEAR_COOKIE } from '@/lib/data'
import { isAllocationMethod, type AllocationMethod } from '@/lib/core/liability-allocation'
import { hashInputs } from '@/lib/repository'

// Every action re-checks the session: actions are reachable by direct POST.
// Callers await the action, then call scheduleRefresh() (see lib/refresh-context.tsx).

const RULES_VERSION = 'tax-engine-2026-estimate'

export async function selectTaxYear(year: number): Promise<void> {
  await requireSession()
  const repository = getRepository()
  if (!repository.taxYears().some((t) => t.year === year)) throw new Error(`No data for tax year ${year}`)
  ;(await cookies()).set(YEAR_COOKIE, String(year), { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
}

/** Remembers how the Overview splits joint liability between the spouses (display only; no tax changes). */
export async function setAllocationMethod(method: AllocationMethod): Promise<void> {
  await requireSession()
  if (!isAllocationMethod(method)) throw new Error('Unknown allocation method')
  ;(await cookies()).set(ALLOCATION_COOKIE, method, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
}

export async function setFilingStatus(year: number, status: FilingStatus): Promise<void> {
  await requireSession()
  const repository = getRepository()
  if (!(status in FILING_STATUS_LABELS)) throw new Error('Unknown filing status')
  const record = repository.taxYears().find((t) => t.year === year)
  if (!record) throw new Error(`No data for tax year ${year}`)
  repository.put('taxYears', { ...record, filingStatus: status })
}

/** Recomputes the year's results and saves them as a reproducible snapshot. */
export async function recalculate(year: number): Promise<void> {
  await requireSession()
  const repository = getRepository()
  const input = repository.yearData(year)
  const model = buildOverview(input, 'household')
  repository.saveRun({
    taxYear: year,
    ranAt: new Date().toISOString(),
    inputsHash: hashInputs(input),
    rulesVersion: RULES_VERSION,
    outputs: {
      liability: { federal: model.liability.federal, ca: model.liability.ca },
      payments: { federal: model.payments.federal, ca: model.payments.ca },
      refund: { federal: model.refund.federal, ca: model.refund.ca },
    },
  })
}

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

/** Replaces all data with a backup file's JSON text. */
export async function restoreBackup(json: string): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  try {
    const { records } = repository.importAll(JSON.parse(json))
    return { ok: true, message: `Backup restored (${records} records).` }
  } catch (err) {
    return { ok: false, message: err instanceof SyntaxError ? 'That file is not valid JSON.' : err instanceof Error ? err.message : 'Restore failed.' }
  }
}

export async function resetToSample(): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  repository.resetToSample()
  return { ok: true, message: 'Sample data restored.' }
}

export async function clearAllData(): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  repository.clearAll()
  return { ok: true, message: 'All data cleared.' }
}

// ---- Paystubs ----

/** Adds or updates a paystub. The server re-validates everything the form sent. */
export async function savePaystub(input: PaystubInput): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  const checked = validatePaystub(
    input,
    repository.all('taxpayers').map((t) => t.id),
    repository.taxYears().map((t) => t.year),
  )
  if (!checked.ok) return { ok: false, message: checked.error }

  const existing = input.id ? repository.get('payroll', input.id) : undefined
  if (input.id && !existing) return { ok: false, message: 'That paystub no longer exists.' }
  repository.put('payroll', { ...existing, ...checked.fields, ...(existing ? { id: existing.id } : {}) })
  return { ok: true, message: existing ? 'Paystub updated.' : 'Paystub added.' }
}

export async function deletePaystub(id: string): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  if (!repository.get('payroll', id)) return { ok: false, message: 'That paystub no longer exists.' }
  repository.remove('payroll', id)
  return { ok: true, message: 'Paystub deleted.' }
}

/** The Paid Out checkbox: paid = reconciled actual numbers; unpaid = still projected / up in the air. */
export async function setPaystubPaidOut(id: string, paidOut: boolean): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  const existing = repository.get('payroll', id)
  if (!existing) return { ok: false, message: 'That paystub no longer exists.' }
  repository.put('payroll', { ...existing, status: paidOut ? 'actual' : 'projected' })
  return { ok: true, message: paidOut ? 'Marked Paid Out.' : 'Marked not paid out.' }
}

export interface SimulatedWithholdingUpdate {
  id: string
  federalWithholding: Cents
  caWithholding: Cents
  socialSecurity: Cents
  medicare: Cents
  caSdi: Cents
  benefits: PaystubBenefits
  preTax: Cents
  gtli: Cents
  employerHsa: Cents
}

const isCents = (n: unknown): n is Cents => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0

/** Applies a "Simulate new withholding" result to the not-yet-Paid-Out rows it was computed from. */
export async function commitWithholdingSimulation(updates: SimulatedWithholdingUpdate[]): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  let applied = 0
  for (const u of updates) {
    const lines = [u.federalWithholding, u.caWithholding, u.socialSecurity, u.medicare, u.caSdi, u.preTax, u.gtli, u.employerHsa, ...Object.values(u.benefits ?? {})]
    if (!lines.every(isCents) || benefitsTotal(u.benefits) !== u.preTax) {
      return { ok: false, message: 'Amounts must be zero or more.' }
    }
    const existing = repository.get('payroll', u.id)
    // Paid Out rows are reconciled against the real stub; a simulation never overwrites one.
    if (!existing || existing.status === 'actual') continue
    repository.put('payroll', {
      ...existing,
      federalWithholding: u.federalWithholding,
      caWithholding: u.caWithholding,
      socialSecurity: u.socialSecurity,
      medicare: u.medicare,
      caSdi: u.caSdi,
      benefits: u.benefits,
      preTax: u.preTax,
      gtli: u.gtli,
      employerHsa: u.employerHsa,
    })
    applied += 1
  }
  return { ok: true, message: `Updated ${applied} paycheck${applied === 1 ? '' : 's'}.` }
}

/** Saves one household itemized-deduction total (property tax, mortgage interest, charity) for the selected year. */
export async function saveDeduction(category: DeductionCategory, amount: Cents): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  if (!(DEDUCTION_CATEGORIES as readonly string[]).includes(category)) return { ok: false, message: 'Unknown deduction.' }
  if (!isCents(amount)) return { ok: false, message: 'Enter zero or a positive amount.' }
  const year = await selectedYear()
  if (!repository.taxYears().some((t) => t.year === year)) return { ok: false, message: 'Pick a tax year first.' }
  const id = `deduction-${year}-${category}`
  const existing = repository.get('deductions', id)
  repository.put('deductions', { ...existing, id, taxYear: year, owner: 'household', category, amount, status: 'manual_estimate' })
  return { ok: true, message: 'Saved.' }
}

/** Saves one person's brokerage results (estimate or final 1099 numbers) for the selected tax year. */
export async function saveInvestmentEntry(input: InvestmentEntryInput): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  const year = await selectedYear()
  if (!repository.taxYears().some((t) => t.year === year)) return { ok: false, message: 'Pick a tax year first.' }
  const checked = validateInvestmentEntry(input, repository.all('taxpayers').map((t) => t.id), year)
  if (!checked.ok) return { ok: false, message: checked.error }

  const [existing, ...duplicates] = matchingEntries(repository.all('investmentSummaries', year), input.taxpayerId, input.brokerage)
  const f = checked.fields
  const empty = f.shortTerm === 0 && f.longTerm === 0 && f.dividendsInterest === 0
  if (!existing && empty && f.status !== 'actual') return { ok: true, message: 'Nothing to save.' }
  repository.put('investmentSummaries', { ...existing, ...f, id: existing?.id ?? investmentId(year, input.taxpayerId, input.brokerage) })
  // One row per person and brokerage: drop any stray copies so they can't be summed twice.
  for (const extra of duplicates) repository.remove('investmentSummaries', extra.id)
  return { ok: true, message: 'Saved.' }
}

/** Capital losses carried in from the prior year (positive amounts), used by the household income summary. */
export async function saveCarryover(kind: 'capital_loss_short' | 'capital_loss_long', amount: Cents): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  if (kind !== 'capital_loss_short' && kind !== 'capital_loss_long') return { ok: false, message: 'Unknown carryover.' }
  if (!isCents(amount)) return { ok: false, message: 'Enter zero or a positive amount.' }
  const year = await selectedYear()
  if (!repository.taxYears().some((t) => t.year === year)) return { ok: false, message: 'Pick a tax year first.' }
  const id = `carry-${year}-${kind}`
  const existing = repository.get('carryovers', id)
  repository.put('carryovers', { ...existing, id, taxYear: year, jurisdiction: 'federal', kind, amount })
  return { ok: true, message: 'Saved.' }
}
