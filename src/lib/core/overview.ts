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
import { applyRate, ratio, sum, sumBy, type Cents } from '@/lib/core/money'
import { afterTaxTotal } from '@/lib/core/payroll'

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
  afterTax: Cents
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
  /** 1 for the household; a person's fraction of household personal income, which scales liability. */
  liabilityShare: number
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

/** W-2 Box 1 wages for one paycheck: gross less pre-tax deductions, plus group-term life imputed income. */
const w2Wages = (r: PayrollRecord): Cents => r.gross - r.preTax + (r.gtli ?? 0)

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
    afterTax: sumBy(records, afterTaxTotal),
  }
  const takeHome = t.gross - t.federal - t.ca - t.socialSecurity - t.medicare - t.caSdi - t.preTax - t.afterTax
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
  // Brokerage results belong to one person; rows without an owner are legacy joint rows (household only).
  const scopedInvestments = household ? input.investments : input.investments.filter((i) => i.owner === scope)

  // The household files jointly, so liability is computed once for the household. A person's view shows their
  // share of it, proportional to their share of the household's personal income (wages + brokerage results).
  // Payments follow the person: only their own paychecks' withholding counts against their share.
  const personalIncome = (id: string) =>
    sumBy(input.payroll.filter((r) => r.taxpayerId === id), w2Wages) +
    sumBy(input.investments.filter((i) => i.owner === id), (i) => i.shortTerm + i.longTerm + i.dividendsInterest)
  const everyoneIncome = sumBy(input.taxpayers, (t) => personalIncome(t.id))
  const liabilityShare = household ? 1 : everyoneIncome > 0 ? Math.min(1, Math.max(0, personalIncome(scope) / everyoneIncome)) : 0
  const liabilityFor = (j: Jurisdiction) =>
    applyRate(sumBy(input.liabilities.filter((l) => l.jurisdiction === j), (l) => l.amount), liabilityShare)
  const liability = byJurisdiction(liabilityFor('federal'), liabilityFor('ca'))
  const scopedActualPayroll = scopedPayroll.filter((r) => r.status === 'actual')
  const payments = byJurisdiction(
    sumBy(scopedPayroll, (r) => r.federalWithholding),
    sumBy(scopedPayroll, (r) => r.caWithholding),
  )
  const paymentsActual = byJurisdiction(
    sumBy(scopedActualPayroll, (r) => r.federalWithholding),
    sumBy(scopedActualPayroll, (r) => r.caWithholding),
  )
  const refund = byJurisdiction(payments.federal - liability.federal, payments.ca - liability.ca)

  // Income: W-2 wages (gross less pre-tax, plus imputed life insurance) per scope; brokerage income is per owner; other income is joint.
  const components: IncomeComponent[] = [
    {
      key: 'wages',
      label: 'Wages (W-2)',
      amount: sumBy(scopedPayroll, w2Wages),
      status: combinedStatus(scopedPayroll.map((r) => r.status)),
    },
  ]
  const invStatus = combinedStatus(scopedInvestments.map((i) => i.status))
  components.push(
    { key: 'shortTerm', label: 'Net short-term gain/loss', amount: sumBy(scopedInvestments, (i) => i.shortTerm), status: invStatus },
    { key: 'longTerm', label: 'Net long-term gain/loss', amount: sumBy(scopedInvestments, (i) => i.longTerm), status: invStatus },
    { key: 'dividendsInterest', label: 'Dividends & interest', amount: sumBy(scopedInvestments, (i) => i.dividendsInterest), status: invStatus },
  )
  if (household) {
    components.push({
      key: 'other',
      label: 'Other income',
      amount: sumBy(input.otherIncome, (o) => o.amount),
      status: combinedStatus(input.otherIncome.map((o) => o.status)),
    })
  }
  const incomeTotal = sumBy(components, (c) => c.amount)

  // Monthly withholding, cumulative.
  let running = 0
  const monthly: MonthPoint[] = MONTHS.map((month, i) => {
    const records = scopedPayroll.filter((r) => Number(r.payDate.slice(5, 7)) === i + 1)
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

  const investmentRows = scopedInvestments.map((i) => ({ ...i, total: i.shortTerm + i.longTerm + i.dividendsInterest }))

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
    liabilityShare,
    liability,
    liabilityStatus: combinedStatus(input.liabilities.map((l) => l.status)) === 'actual' ? 'actual' : 'manual_estimate',
    payments,
    paymentsActual,
    refund,
    income: { components, total: incomeTotal, excludesJointIncome: !household },
    effectiveRates: {
      federal: ratio(liability.federal, incomeTotal),
      ca: ratio(liability.ca, incomeTotal),
      combined: ratio(liability.total, incomeTotal),
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
