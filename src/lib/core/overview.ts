import type {
  ActivityItem,
  InvestmentSourceSummary,
  Jurisdiction,
  LiabilityEstimate,
  OtherIncome,
  PayrollRecord,
  Provenance,
  Taxpayer,
} from '@/lib/core/types'
import { ratio, sum, sumBy, type Cents } from '@/lib/core/money'

/*
 * Derives every Overview figure from canonical records (spec §5: derived
 * totals are recalculated, never edited). Pure functions; no UI.
 */

export interface OverviewInput {
  taxpayers: Taxpayer[]
  payroll: PayrollRecord[]
  investments: InvestmentSourceSummary[]
  otherIncome: OtherIncome[]
  liabilities: LiabilityEstimate[]
  activity: ActivityItem[]
}

export type Scope = 'household' | string

export interface ByJurisdiction {
  federal: Cents
  ca: Cents
  total: Cents
}

export interface IncomeComponent {
  key: 'wages' | 'shortTerm' | 'longTerm' | 'dividendsInterest' | 'other'
  label: string
  amount: Cents
  status: Provenance | 'mixed'
}

export interface MonthPoint {
  month: string
  status: Provenance
  federal: Cents
  ca: Cents
  /** Withholding paid in this month. */
  paid: Cents
  cumulative: Cents
}

export interface PayrollTotals {
  gross: Cents
  federal: Cents
  ca: Cents
  socialSecurity: Cents
  medicare: Cents
  caSdi: Cents
  preTax: Cents
  takeHome: Cents
}

export interface PaycheckRow {
  taxpayerId: string
  name: string
  ytd: PayrollTotals
  fullYear: PayrollTotals
}

export interface WithholdingProgress {
  jurisdiction: Jurisdiction
  actual: Cents
  projectedRemaining: Cents
  liability: Cents
  /** projected total ÷ liability */
  coverage: number
  /** projected total − liability; positive = over-withheld. */
  difference: Cents
}

export interface InvestmentRow extends InvestmentSourceSummary {
  total: Cents
}

export interface OverviewModel {
  scope: Scope
  liability: ByJurisdiction
  liabilityStatus: Provenance
  payments: ByJurisdiction
  paymentsActual: ByJurisdiction
  /** payments − liability; positive = refund, negative = amount due. */
  refund: ByJurisdiction
  income: { components: IncomeComponent[]; total: Cents; excludesJointIncome: boolean }
  effectiveRates: { federal: number; ca: number; combined: number }
  monthly: MonthPoint[]
  lastActualMonth: string | null
  withholding: WithholdingProgress[]
  investments: { rows: InvestmentRow[]; totals: Pick<InvestmentRow, 'shortTerm' | 'longTerm' | 'dividendsInterest' | 'total'> }
  paychecks: { rows: PaycheckRow[]; total: PaycheckRow | null }
  activity: ActivityItem[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const byJurisdiction = (federal: Cents, ca: Cents): ByJurisdiction => ({ federal, ca, total: federal + ca })

function payrollTotals(records: PayrollRecord[]): PayrollTotals {
  const t = {
    gross: sumBy(records, (r) => r.gross),
    federal: sumBy(records, (r) => r.federalWithholding),
    ca: sumBy(records, (r) => r.caWithholding),
    socialSecurity: sumBy(records, (r) => r.socialSecurity),
    medicare: sumBy(records, (r) => r.medicare),
    caSdi: sumBy(records, (r) => r.caSdi),
    preTax: sumBy(records, (r) => r.preTax),
  }
  const takeHome = t.gross - t.federal - t.ca - t.socialSecurity - t.medicare - t.caSdi - t.preTax
  return { ...t, takeHome }
}

function addTotals(a: PayrollTotals, b: PayrollTotals): PayrollTotals {
  const out = { ...a }
  for (const key of Object.keys(out) as (keyof PayrollTotals)[]) out[key] = a[key] + b[key]
  return out
}

function combinedStatus(statuses: Provenance[]): Provenance | 'mixed' {
  const unique = new Set(statuses)
  return unique.size === 1 ? statuses[0] : 'mixed'
}

/** Warnings first, then completed (newest first), then upcoming (soonest first). */
function orderActivity(items: ActivityItem[]): ActivityItem[] {
  const of = (kind: ActivityItem['kind']) => items.filter((a) => a.kind === kind)
  return [
    ...of('warning'),
    ...of('done').sort((a, b) => b.date.localeCompare(a.date)),
    ...of('upcoming').sort((a, b) => a.date.localeCompare(b.date)),
  ]
}

export function buildOverview(input: OverviewInput, scope: Scope): OverviewModel {
  const household = scope === 'household'
  const scopedPayroll = household ? input.payroll : input.payroll.filter((r) => r.taxpayerId === scope)
  const actualPayroll = input.payroll.filter((r) => r.status === 'actual')

  // Liability and payments are joint under MFJ, so they never narrow by scope (spec §3).
  const liabilityFor = (j: Jurisdiction) => sumBy(input.liabilities.filter((l) => l.jurisdiction === j), (l) => l.amount)
  const liability = byJurisdiction(liabilityFor('federal'), liabilityFor('ca'))
  const payments = byJurisdiction(
    sumBy(input.payroll, (r) => r.federalWithholding),
    sumBy(input.payroll, (r) => r.caWithholding),
  )
  const paymentsActual = byJurisdiction(
    sumBy(actualPayroll, (r) => r.federalWithholding),
    sumBy(actualPayroll, (r) => r.caWithholding),
  )
  const refund = byJurisdiction(payments.federal - liability.federal, payments.ca - liability.ca)

  // Income: W-2 wages (gross less pre-tax) per scope; investment and other income are joint.
  const components: IncomeComponent[] = [
    {
      key: 'wages',
      label: 'Wages (W-2)',
      amount: sumBy(scopedPayroll, (r) => r.gross - r.preTax),
      status: combinedStatus(scopedPayroll.map((r) => r.status)),
    },
  ]
  if (household) {
    const invStatus = combinedStatus(input.investments.map((i) => i.status))
    components.push(
      { key: 'shortTerm', label: 'Net short-term gain/loss', amount: sumBy(input.investments, (i) => i.shortTerm), status: invStatus },
      { key: 'longTerm', label: 'Net long-term gain/loss', amount: sumBy(input.investments, (i) => i.longTerm), status: invStatus },
      { key: 'dividendsInterest', label: 'Dividends & interest', amount: sumBy(input.investments, (i) => i.dividendsInterest), status: invStatus },
      {
        key: 'other',
        label: 'Other income',
        amount: sumBy(input.otherIncome, (o) => o.amount),
        status: combinedStatus(input.otherIncome.map((o) => o.status)),
      },
    )
  }
  const incomeTotal = sumBy(components, (c) => c.amount)
  const householdIncome = household ? incomeTotal : buildOverview(input, 'household').income.total

  // Monthly withholding, cumulative.
  let running = 0
  const monthly: MonthPoint[] = MONTHS.map((month, i) => {
    const records = input.payroll.filter((r) => Number(r.payDate.slice(5, 7)) === i + 1)
    const federal = sumBy(records, (r) => r.federalWithholding)
    const ca = sumBy(records, (r) => r.caWithholding)
    running += federal + ca
    const status: Provenance = records.length > 0 && records.every((r) => r.status === 'actual') ? 'actual' : 'projected'
    return { month, status, federal, ca, paid: federal + ca, cumulative: running }
  })
  const lastActual = monthly.filter((m) => m.status === 'actual').at(-1)

  const withholding: WithholdingProgress[] = (['federal', 'ca'] as const).map((j) => ({
    jurisdiction: j,
    actual: paymentsActual[j],
    projectedRemaining: payments[j] - paymentsActual[j],
    liability: liability[j],
    coverage: ratio(payments[j], liability[j]),
    difference: payments[j] - liability[j],
  }))

  const investmentRows = input.investments.map((i) => ({ ...i, total: i.shortTerm + i.longTerm + i.dividendsInterest }))

  const people = household ? input.taxpayers : input.taxpayers.filter((t) => t.id === scope)
  const paycheckRows: PaycheckRow[] = people.map((t) => {
    const records = input.payroll.filter((r) => r.taxpayerId === t.id)
    return {
      taxpayerId: t.id,
      name: t.name,
      ytd: payrollTotals(records.filter((r) => r.status === 'actual')),
      fullYear: payrollTotals(records),
    }
  })

  return {
    scope,
    liability,
    liabilityStatus: combinedStatus(input.liabilities.map((l) => l.status)) === 'actual' ? 'actual' : 'manual_estimate',
    payments,
    paymentsActual,
    refund,
    income: { components, total: incomeTotal, excludesJointIncome: !household },
    effectiveRates: {
      federal: ratio(liability.federal, householdIncome),
      ca: ratio(liability.ca, householdIncome),
      combined: ratio(liability.total, householdIncome),
    },
    monthly,
    lastActualMonth: lastActual?.month ?? null,
    withholding,
    investments: {
      rows: investmentRows,
      totals: {
        shortTerm: sumBy(investmentRows, (r) => r.shortTerm),
        longTerm: sumBy(investmentRows, (r) => r.longTerm),
        dividendsInterest: sumBy(investmentRows, (r) => r.dividendsInterest),
        total: sum(investmentRows.map((r) => r.total)),
      },
    },
    paychecks: {
      rows: paycheckRows,
      total:
        paycheckRows.length > 1
          ? {
              taxpayerId: 'total',
              name: 'Total',
              ytd: paycheckRows.map((r) => r.ytd).reduce(addTotals),
              fullYear: paycheckRows.map((r) => r.fullYear).reduce(addTotals),
            }
          : null,
    },
    activity: orderActivity(input.activity),
  }
}
