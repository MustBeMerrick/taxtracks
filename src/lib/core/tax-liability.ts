import type { FilingStatus } from './filing-status'
import { getIncomeRules, type Bracket } from './income-rules'
import { brokerageAnnuals, calculateIncomeSummary, itemizedAnnuals, payrollAnnuals, type DeductionChoice, type IncomeSummary } from './income-summary'
import { applyRate, cents, type Cents } from './money'
import type { Carryover, Deduction, InvestmentSourceSummary, LiabilityEstimate, PayrollRecord, TaxPayment } from './types'

/*
 * Estimated income-tax liability for the household, from the income summary (taxable income) and the
 * year's rate schedules. Federal = ordinary tax + capital gains tax + net investment income tax +
 * Additional Medicare tax not already withheld. California = rate schedule less the exemption credit.
 * Payroll taxes (Social Security, the first Medicare, SDI) are withheld at the source and not part of this.
 */

export interface TaxEstimate {
  federal: {
    ordinaryTaxableIncome: Cents
    ordinaryTax: Cents
    capitalGainsIncome: Cents
    capitalGainsTax: Cents
    netInvestmentIncome: Cents
    niit: Cents
    /** Form 8959 tax on combined Medicare wages over the threshold, less what employers already withheld. */
    additionalMedicare: Cents
    total: Cents
  }
  california: {
    taxableIncome: Cents
    tax: Cents
    exemptionCredit: Cents
    total: Cents
  }
}

/** Progressive tax on `income` (cents) using brackets. */
export function bracketTax(income: Cents, brackets: Bracket[]): Cents {
  let tax = 0
  for (let i = 0; i < brackets.length; i++) {
    const top = brackets[i + 1]?.over ?? Infinity
    if (income <= brackets[i].over) break
    tax += applyRate(Math.min(income, top) - brackets[i].over, brackets[i].rate)
  }
  return tax
}

export interface TaxEstimateInput {
  taxYear: number
  filingStatus: FilingStatus
  summary: IncomeSummary
  /** Brokerage dividends (already inside ordinary income). */
  dividends: Cents
  /** Each person's annual Medicare wages, for Additional Medicare tax and what was already withheld. */
  medicareWages: Cents[]
}

/** Null when this year or filing status has no verified tables. */
export function estimateTax(input: TaxEstimateInput): TaxEstimate | null {
  const rules = getIncomeRules(input.taxYear)
  const brackets = rules?.federalBrackets[input.filingStatus]
  const gains = rules?.capitalGainsBreakpoints[input.filingStatus]
  const caRows = rules?.californiaRates[input.filingStatus]
  if (!rules || !brackets || !gains || !caRows) return null
  const s = input.summary

  const ordinaryTax = bracketTax(s.federalOrdinaryTaxable, brackets)

  // Capital gains stack on top of ordinary taxable income: 0% up to the first breakpoint, 15% to the second, 20% above.
  const base = s.federalOrdinaryTaxable
  const top = base + s.ltcgIncome
  const band = (from: number, to: number) => Math.max(0, Math.min(top, to) - Math.max(base, from))
  const capitalGainsTax = applyRate(band(gains.zeroTop, gains.fifteenTop), 0.15) + applyRate(band(gains.fifteenTop, Infinity), 0.2)

  // Net investment income tax: 3.8% of the lesser of net investment income and AGI over the threshold.
  const agi = s.federalAgi
  const netInvestmentIncome = Math.max(0, s.ordinaryIncome - s.baseSalary + s.ltcgIncome - s.capitalLossAllowed) // dividends + net gains
  const niit = applyRate(Math.min(netInvestmentIncome, Math.max(0, agi - rules.niitThreshold[input.filingStatus])), rules.niitRate)

  // Additional Medicare: owed on combined wages over the threshold; each employer withheld on its own wages over $200,000.
  const owed = applyRate(Math.max(0, input.medicareWages.reduce((t, w) => t + w, 0) - rules.additionalMedicareThreshold[input.filingStatus]), rules.additionalMedicareRate)
  const withheld = input.medicareWages.reduce((t, w) => t + applyRate(Math.max(0, w - cents(200_000)), rules.additionalMedicareRate), 0)
  const additionalMedicare = Math.max(0, owed - withheld)

  const federalTotal = ordinaryTax + capitalGainsTax + niit + additionalMedicare

  const caIncome = s.stateTaxable
  let caTax = 0
  for (const row of caRows) if (caIncome > cents(row.over)) caTax = cents(row.base) + applyRate(caIncome - cents(row.over), row.rate)
  const exemptionCredit = Math.min(caTax, rules.californiaExemptionCredit[input.filingStatus])

  return {
    federal: {
      ordinaryTaxableIncome: s.federalOrdinaryTaxable,
      ordinaryTax,
      capitalGainsIncome: s.ltcgIncome,
      capitalGainsTax,
      netInvestmentIncome,
      niit,
      additionalMedicare,
      total: federalTotal,
    },
    california: { taxableIncome: caIncome, tax: caTax, exemptionCredit, total: caTax - exemptionCredit },
  }
}

export interface HouseholdRecords {
  taxpayerIds: string[]
  payroll: PayrollRecord[]
  investments: InvestmentSourceSummary[]
  carryovers: Carryover[]
  deductions: Deduction[]
  /** Every year's tax payments: deductibility goes by the date paid. */
  taxPayments: TaxPayment[]
}

/**
 * Everything needed to estimate a household's tax from its stored records: one return covering `taxpayerIds`.
 * Null when the year isn't supported. `choices` forces standard vs. itemized (default: the larger, per return).
 */
export function estimateHouseholdTax(
  taxYear: number,
  filingStatus: FilingStatus,
  records: HouseholdRecords,
  choices: { federal?: DeductionChoice; state?: DeductionChoice } = {},
) {
  const carry = (kind: Carryover['kind']) => records.carryovers.find((c) => c.kind === kind)?.amount ?? 0
  const people = records.taxpayerIds.map((id) => payrollAnnuals(records.payroll.filter((p) => p.taxpayerId === id)))
  const total = payrollAnnuals(records.payroll.filter((p) => records.taxpayerIds.includes(p.taxpayerId)))
  const brokerage = brokerageAnnuals(records.investments.filter((i) => i.owner && records.taxpayerIds.includes(i.owner)))
  const summary = calculateIncomeSummary(taxYear, {
    filingStatus,
    federalDeductionChoice: choices.federal,
    stateDeductionChoice: choices.state,
    ...total,
    ...brokerage,
    ...itemizedAnnuals(taxYear, records.deductions, records.taxPayments),
    carryoverShort: carry('capital_loss_short'),
    carryoverLong: carry('capital_loss_long'),
  })
  if (!summary) return null
  const medicareWages = people.map((p) => Math.max(0, p.salary - p.nonPayrollTaxWages - p.section125 - p.hsa + p.gtli))
  const estimate = estimateTax({ taxYear, filingStatus, summary, dividends: brokerage.dividends, medicareWages })
  return estimate && { summary, estimate }
}

export interface SeparateReturns {
  /** Each spouse's married-filing-separately return. */
  people: Record<string, { summary: IncomeSummary; estimate: TaxEstimate }>
  /** Both spouses itemize, or both take the standard deduction, in each jurisdiction. */
  federalItemizes: boolean
  stateItemizes: boolean
  total: { federal: Cents; ca: Cents }
}

/** `amount` split into `n` whole-cent shares that add up exactly; the first shares take the leftover cents. */
const shareOf = (amount: Cents, i: number, n: number): Cents => Math.floor(amount / n) + (i < amount - Math.floor(amount / n) * n ? 1 : 0)

/**
 * Married filing separately: one return per spouse, each with their own wages and their own brokerage accounts
 * (treated as separate property; California community-property splitting is not applied). Items with no spouse as
 * owner (household deductions, tax payments, carryovers) are split equally. In each jurisdiction the pair either
 * both itemize or both take the standard deduction, whichever costs less in total. Null when the year isn't supported.
 */
export function estimateSeparateReturns(taxYear: number, records: HouseholdRecords): SeparateReturns | null {
  const ids = records.taxpayerIds
  const n = ids.length
  const perPerson = ids.map(
    (id, i): HouseholdRecords => ({
      ...records,
      taxpayerIds: [id],
      deductions: records.deductions.flatMap((d) =>
        d.owner === id ? [d] : ids.includes(d.owner) ? [] : [{ ...d, amount: shareOf(d.amount, i, n) }],
      ),
      taxPayments: records.taxPayments.map((p) => ({ ...p, amount: shareOf(p.amount, i, n) })),
      carryovers: records.carryovers.map((c) => ({ ...c, amount: shareOf(c.amount, i, n) })),
    }),
  )
  const run = (federal: DeductionChoice, state: DeductionChoice) => perPerson.map((r) => estimateHouseholdTax(taxYear, 'mfs', r, { federal, state }))
  const itemized = run('itemized', 'itemized')
  const standard = run('standard', 'standard')
  if ([...itemized, ...standard].some((r) => !r)) return null
  // Federal tax doesn't depend on the California choice or the other way round, so each is picked on its own.
  const totalOf = (rows: typeof itemized, pick: (e: TaxEstimate) => Cents) => rows.reduce((t, r) => t + pick(r!.estimate), 0)
  const federalItemizes = totalOf(itemized, (e) => e.federal.total) < totalOf(standard, (e) => e.federal.total)
  const stateItemizes = totalOf(itemized, (e) => e.california.total) < totalOf(standard, (e) => e.california.total)
  const chosen = run(federalItemizes ? 'itemized' : 'standard', stateItemizes ? 'itemized' : 'standard')
  const people = Object.fromEntries(ids.map((id, i) => [id, chosen[i]!]))
  return {
    people,
    federalItemizes,
    stateItemizes,
    total: { federal: totalOf(chosen, (e) => e.federal.total), ca: totalOf(chosen, (e) => e.california.total) },
  }
}

/**
 * The household's liability as filed: one joint return, or under married filing separately the two separate returns
 * added together (with `people` holding each spouse's own). Null when the year or status has no tables.
 */
export function householdLiability(
  taxYear: number,
  filingStatus: FilingStatus,
  records: HouseholdRecords,
): { federal: Cents; ca: Cents; people?: Record<string, { federal: Cents; ca: Cents }> } | null {
  if (filingStatus === 'mfs') {
    const separate = estimateSeparateReturns(taxYear, records)
    if (!separate) return null
    const people = Object.fromEntries(
      Object.entries(separate.people).map(([id, r]) => [id, { federal: r.estimate.federal.total, ca: r.estimate.california.total }]),
    )
    return { ...separate.total, people }
  }
  const joint = estimateHouseholdTax(taxYear, filingStatus, records)
  return joint && { federal: joint.estimate.federal.total, ca: joint.estimate.california.total }
}

/** The estimate as the liability rows the Overview reads (household totals per jurisdiction). */
export function estimatedLiabilities(taxYear: number, estimate: { federal: Cents; ca: Cents }, now: string): LiabilityEstimate[] {
  const row = (jurisdiction: 'federal' | 'ca', amount: Cents): LiabilityEstimate => ({
    id: `liability-${taxYear}-${jurisdiction}`,
    createdAt: now,
    updatedAt: now,
    taxYear,
    jurisdiction,
    amount,
    status: 'projected',
    source: 'Tax Engine estimate',
  })
  return [row('federal', estimate.federal), row('ca', estimate.ca)]
}
