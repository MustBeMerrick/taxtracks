import { applyRate, formatMoney, cents, sum, type Cents } from './money'
import { formatPayDate, isSemiMonthlyPayDate } from './pay-dates'
import type { PaystubBenefits, PayrollRecord } from './types'
import { getWithholdingRules, UnsupportedTaxYearError } from './withholding/rules'

/*
 * Pure paystub-ledger logic: net pay, year-to-date running totals and the
 * "hard rule" warnings (Social Security cap, contribution limits, bookkeeping).
 * A paystub counts toward YTD only once it is marked Paid Out (status 'actual').
 */

export const EMPTY_BENEFITS: PaystubBenefits = {
  medical: 0,
  dental: 0,
  vision: 0,
  healthcareFsa: 0,
  dependentFsa: 0,
  hsa: 0,
  retirement401k: 0,
}

export const isPaidOut = (record: PayrollRecord) => record.status === 'actual'

export function benefitsTotal(benefits: PaystubBenefits): Cents {
  return sum(Object.values(benefits))
}

export const totalTaxes = (r: PayrollRecord): Cents =>
  r.federalWithholding + r.caWithholding + r.socialSecurity + r.medicare + r.caSdi

export const netPay = (r: PayrollRecord): Cents => r.gross - r.preTax - totalTaxes(r)

/** The columns that accumulate into year-to-date. */
export interface PaystubAmounts {
  gross: Cents
  preTax: Cents
  federal: Cents
  socialSecurity: Cents
  medicare: Cents
  ca: Cents
  sdi: Cents
  net: Cents
}

const ZERO: PaystubAmounts = { gross: 0, preTax: 0, federal: 0, socialSecurity: 0, medicare: 0, ca: 0, sdi: 0, net: 0 }

export function amountsOf(r: PayrollRecord): PaystubAmounts {
  return {
    gross: r.gross,
    preTax: r.preTax,
    federal: r.federalWithholding,
    socialSecurity: r.socialSecurity,
    medicare: r.medicare,
    ca: r.caWithholding,
    sdi: r.caSdi,
    net: netPay(r),
  }
}

function add(a: PaystubAmounts, b: PaystubAmounts): PaystubAmounts {
  return {
    gross: a.gross + b.gross,
    preTax: a.preTax + b.preTax,
    federal: a.federal + b.federal,
    socialSecurity: a.socialSecurity + b.socialSecurity,
    medicare: a.medicare + b.medicare,
    ca: a.ca + b.ca,
    sdi: a.sdi + b.sdi,
    net: a.net + b.net,
  }
}

export function sortPaystubs(records: PayrollRecord[]): PayrollRecord[] {
  return [...records].sort((a, b) => a.payDate.localeCompare(b.payDate) || a.createdAt.localeCompare(b.createdAt))
}

export interface PaystubRow {
  record: PayrollRecord
  amounts: PaystubAmounts
  /** Paid-out paychecks up to and including this one's date. An unpaid row shows the paid total so far. */
  ytd: PaystubAmounts
}

/** Chronological rows with running year-to-date totals that count Paid Out paychecks only. */
export function paystubRows(records: PayrollRecord[]): PaystubRow[] {
  let running = ZERO
  return sortPaystubs(records).map((record) => {
    const amounts = amountsOf(record)
    if (isPaidOut(record)) running = add(running, amounts)
    return { record, amounts, ytd: running }
  })
}

export interface PaystubSummary {
  /** Paid Out paychecks only. */
  paid: PaystubAmounts
  /** Paid Out plus not-yet-paid (the full-year picture). */
  fullYear: PaystubAmounts
  paidCount: number
  pendingCount: number
}

export function summarize(records: PayrollRecord[]): PaystubSummary {
  const all = records.map(amountsOf)
  const paidRecords = records.filter(isPaidOut)
  return {
    paid: paidRecords.map(amountsOf).reduce(add, ZERO),
    fullYear: all.reduce(add, ZERO),
    paidCount: paidRecords.length,
    pendingCount: records.length - paidRecords.length,
  }
}

// ── Warnings ────────────────────────────────────────────────────────────────────────────

export type WarningSeverity = 'error' | 'warning' | 'info'

export interface PayrollWarning {
  id: string
  severity: WarningSeverity
  /** The paystub the warning is about, when it is about one. */
  recordId?: string
  message: string
}

/** Rounding slack for a capped tax: per-paycheck rounding can leave the total a few cents off the cap. */
const CAP_TOLERANCE: Cents = 5

/**
 * Hard rules for one person's paystubs in one tax year. `today` (ISO date) is injected for testing.
 * Covers every paystub, paid or not, so projected rows warn before they are paid.
 */
export function payrollWarnings(records: PayrollRecord[], today: string): PayrollWarning[] {
  if (records.length === 0) return []
  const warnings: PayrollWarning[] = []
  const rows = sortPaystubs(records)
  const taxYear = rows[0].taxYear

  let rules: ReturnType<typeof getWithholdingRules> | null = null
  try {
    rules = getWithholdingRules(taxYear)
  } catch (err) {
    if (!(err instanceof UnsupportedTaxYearError)) throw err
    warnings.push({ id: 'no-rules', severity: 'info', message: `No contribution or wage-base limits are on file for ${taxYear}, so those checks are skipped.` })
  }

  if (rules) {
    const maxSocialSecurity = applyRate(cents(rules.fica.socialSecurityWageBase), rules.fica.socialSecurityRate)
    const cap = `${formatMoney(maxSocialSecurity)} (wage base ${formatMoney(cents(rules.fica.socialSecurityWageBase), { precision: 'whole' })})`

    // Social Security (OASDI): total withheld can never exceed 6.2% of the wage base.
    let cumulative = 0
    let reachedAt: PayrollRecord | undefined
    let exceededAt: PayrollRecord | undefined
    for (const r of rows) {
      cumulative += r.socialSecurity
      if (!reachedAt && cumulative >= maxSocialSecurity - CAP_TOLERANCE) reachedAt = r
      if (!exceededAt && cumulative > maxSocialSecurity + CAP_TOLERANCE) exceededAt = r
    }
    if (exceededAt) {
      warnings.push({
        id: 'ss-over-cap',
        severity: 'error',
        recordId: exceededAt.id,
        message: `Social Security withheld reaches ${formatMoney(cumulative)} by ${formatPayDate(rows.at(-1)!.payDate)}, over the ${cap} annual maximum. Withholding past the cap is refundable from the employer; check ${formatPayDate(exceededAt.payDate)} and later.`,
      })
    } else if (reachedAt) {
      warnings.push({
        id: 'ss-cap-reached',
        severity: 'info',
        recordId: reachedAt.id,
        message: `Social Security reaches the ${cap} annual maximum on the ${formatPayDate(reachedAt.payDate)} paycheck; later paychecks should withhold $0.`,
      })
    }

    // Employee contribution limits (running totals over the year).
    const withBenefits = rows.filter((r) => r.benefits)
    const sumOf = (pick: (b: PaystubBenefits) => Cents) => sum(withBenefits.map((r) => pick(r.benefits!)))
    const limit = (id: string, label: string, total: Cents, max: number, note = '') => {
      if (total > cents(max)) {
        warnings.push({ id, severity: 'warning', message: `${label} totals ${formatMoney(total)} for ${taxYear}, over the ${formatMoney(cents(max), { precision: 'whole' })} limit.${note}` })
      }
    }
    limit('401k-limit', '401(k) deferrals', sumOf((b) => b.retirement401k), rules.limits.retirementDeferral, ' (Age 50+ catch-up contributions can raise this.)')
    limit('health-fsa-limit', 'Healthcare FSA', sumOf((b) => b.healthcareFsa), rules.limits.healthcareFsa)
    limit('dependent-fsa-limit', 'Dependent care FSA', sumOf((b) => b.dependentFsa), rules.limits.dependentCareFsa)
    limit(
      'hsa-limit',
      'HSA (yours plus employer)',
      sumOf((b) => b.hsa) + sum(rows.map((r) => r.employerHsa ?? 0)),
      rules.limits.hsaFamily,
      ' (Family limit shown; age 55+ catch-up adds $1,000.)',
    )
  }

  // Bookkeeping.
  const seenDates = new Map<string, PayrollRecord>()
  for (const r of rows) {
    const dup = seenDates.get(r.payDate)
    if (dup) {
      warnings.push({ id: `dup-${r.id}`, severity: 'warning', recordId: r.id, message: `Two paystubs are dated ${formatPayDate(r.payDate)}. Is one a duplicate?` })
    }
    seenDates.set(r.payDate, r)

    if (netPay(r) < 0) {
      warnings.push({ id: `neg-net-${r.id}`, severity: 'error', recordId: r.id, message: `The ${formatPayDate(r.payDate)} paystub has negative net pay (${formatMoney(netPay(r))}); deductions and taxes exceed gross.` })
    }
    if (r.benefits && benefitsTotal(r.benefits) !== r.preTax) {
      warnings.push({ id: `pretax-${r.id}`, severity: 'error', recordId: r.id, message: `The ${formatPayDate(r.payDate)} paystub's pre-tax total doesn't match its line items.` })
    }
    if (isPaidOut(r) && r.payDate > today) {
      warnings.push({ id: `future-paid-${r.id}`, severity: 'warning', recordId: r.id, message: `The ${formatPayDate(r.payDate)} paystub is marked Paid Out but its pay date is in the future.` })
    }
    if (!isPaidOut(r) && r.payDate < today) {
      warnings.push({ id: `unpaid-past-${r.id}`, severity: 'info', recordId: r.id, message: `The ${formatPayDate(r.payDate)} pay date has passed but the paystub isn't marked Paid Out.` })
    }
  }

  const offSchedule = rows.filter((r) => !isSemiMonthlyPayDate(r.payDate))
  if (offSchedule.length > 0) {
    const shown = offSchedule.slice(0, 3).map((r) => formatPayDate(r.payDate)).join(', ')
    warnings.push({
      id: 'off-schedule',
      severity: 'info',
      message: `${offSchedule.length} paystub${offSchedule.length === 1 ? ' is' : 's are'} not on a scheduled pay date (the 15th and the last day of the month, or the Friday before if that is a weekend): ${shown}${offSchedule.length > 3 ? ', …' : ''}.`,
    })
  }

  return warnings
}
