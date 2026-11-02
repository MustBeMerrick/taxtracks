import type { FilingStatus } from './filing-status'
import { getIncomeRules, type Bracket } from './income-rules'
import { brokerageAnnuals, calculateIncomeSummary, payrollAnnuals, type IncomeSummary } from './income-summary'
import { applyRate, cents, type Cents } from './money'
import type { Carryover, InvestmentSourceSummary, LiabilityEstimate, PayrollRecord } from './types'

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
  const agi = s.federalOrdinaryTaxable + s.federalStandardDeduction + s.ltcgIncome
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

/** Everything needed to estimate a household's tax from its stored records. Null when the year isn't supported. */
export function estimateHouseholdTax(
  taxYear: number,
  filingStatus: FilingStatus,
  records: { taxpayerIds: string[]; payroll: PayrollRecord[]; investments: InvestmentSourceSummary[]; carryovers: Carryover[] },
) {
  const carry = (kind: Carryover['kind']) => records.carryovers.find((c) => c.kind === kind)?.amount ?? 0
  const people = records.taxpayerIds.map((id) => payrollAnnuals(records.payroll.filter((p) => p.taxpayerId === id)))
  const total = payrollAnnuals(records.payroll.filter((p) => records.taxpayerIds.includes(p.taxpayerId)))
  const brokerage = brokerageAnnuals(records.investments.filter((i) => i.owner && records.taxpayerIds.includes(i.owner)))
  const summary = calculateIncomeSummary(taxYear, {
    filingStatus,
    ...total,
    ...brokerage,
    carryoverShort: carry('capital_loss_short'),
    carryoverLong: carry('capital_loss_long'),
  })
  if (!summary) return null
  const medicareWages = people.map((p) => Math.max(0, p.salary - p.section125 - p.hsa + p.gtli))
  const estimate = estimateTax({ taxYear, filingStatus, summary, dividends: brokerage.dividends, medicareWages })
  return estimate && { summary, estimate }
}

/** The estimate as the liability rows the Overview reads. Null when there are no tables for the year or status. */
export function estimatedLiabilities(taxYear: number, estimate: TaxEstimate, now: string): LiabilityEstimate[] {
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
  return [row('federal', estimate.federal.total), row('ca', estimate.california.total)]
}
