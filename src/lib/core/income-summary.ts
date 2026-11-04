import type { FilingStatus } from './filing-status'
import { getIncomeRules } from './income-rules'
import { profitLoss } from './investments'
import { applyRate, sum, type Cents } from './money'
import type { Deduction, InvestmentSourceSummary, PayrollRecord, TaxPayment } from './types'

/*
 * Marc's spreadsheet, in code: salary + brokerage results → ordinary income, LTCG, capital-loss
 * limit, AGI, deductions (standard or itemized, whichever is larger) and taxable income for one person
 * or the whole household. Taxable income here is before brackets; tax itself comes later.
 *
 * Not modeled: the 2/37 itemized limit for the 37% bracket, California's high-income itemized phaseout,
 * charitable AGI percentage limits, mortgage debt limits (enter deductible interest), medical expenses.
 */

export interface IncomeSummaryInput {
  filingStatus: FilingStatus
  salary: Cents
  shortTermProfit: Cents
  shortTermLoss: Cents
  longTermProfit: Cents
  longTermLoss: Cents
  dividends: Cents
  /** Employee HSA: federal-exempt, but California taxes it. */
  hsa: Cents
  /** Medical, dental, vision and FSAs (Section 125): exempt federally and in California. */
  section125: Cents
  retirement401k: Cents
  /** Group-term life imputed income: taxable, not cash. */
  gtli: Cents
  /** Employer HSA: not federal wages, but California taxes it. */
  employerHsa: Cents
  /** Prior-year capital losses carried in (positive amounts). */
  carryoverShort: Cents
  carryoverLong: Cents
  /** California income tax withheld from paychecks (an itemized deduction federally). */
  stateIncomeTaxWithheld?: Cents
  /** California SDI withheld: a deductible state income tax federally. */
  caSdi?: Cents
  /** California estimated or balance-due payments made during this calendar year, whatever year they were for. */
  stateTaxPayments?: Cents
  propertyTax?: Cents
  /** Deductible home mortgage interest (Form 1098, within the debt limits). */
  mortgageInterest?: Cents
  charityCash?: Cents
  charityNonCash?: Cents
}

export interface IncomeSummary {
  baseSalary: Cents
  netShortTerm: Cents
  netLongTerm: Cents
  /** Salary plus short- and long-term PROFITS plus dividends; losses are ignored. Not a tax figure. */
  grossRealized: Cents
  ordinaryIncome: Cents
  ltcgIncome: Cents
  capitalLossAllowed: Cents
  federalAgi: Cents
  stateAgi: Cents
  federalStandardDeduction: Cents
  /** Cash charity a standard-deduction taxpayer may deduct on top (2026 on); zero when itemizing. */
  federalNonItemizerCharity: Cents
  /** State and local taxes after the SALT cap. */
  federalSaltAllowed: Cents
  federalItemizedDeduction: Cents
  /** What taxable income actually uses: itemized, or standard plus the non-itemizer charity deduction. */
  federalDeduction: Cents
  federalItemizes: boolean
  stateStandardDeduction: Cents
  stateItemizedDeduction: Cents
  stateDeduction: Cents
  federalOrdinaryTaxable: Cents
  stateTaxable: Cents
  capitalLossCarryForward: Cents
  carriedOver: Cents
}

/** Null when the year has no rules yet. */
export function calculateIncomeSummary(taxYear: number, input: IncomeSummaryInput): IncomeSummary | null {
  const rules = getIncomeRules(taxYear)
  if (!rules) return null

  const netShortTerm = input.shortTermProfit - input.shortTermLoss
  const netLongTerm = input.longTermProfit - input.longTermLoss
  const carriedOver = input.carryoverShort + input.carryoverLong

  // Schedule D netting: carried-over losses keep their character; a net loss is then capped.
  const st = netShortTerm - input.carryoverShort
  const lt = netLongTerm - input.carryoverLong
  const net = st + lt
  let ordinaryGain = 0
  let ltcg = 0
  let loss = 0
  if (net < 0) loss = -net
  else if (st >= 0 && lt >= 0) {
    ordinaryGain = st
    ltcg = lt
  } else if (st >= 0) ordinaryGain = net // long-term loss absorbed by short-term gain
  else ltcg = net // short-term loss absorbed by long-term gain

  const limit = rules.capitalLossLimit[input.filingStatus]
  const capitalLossAllowed = Math.min(loss, limit)
  const ordinaryIncome = input.salary + ordinaryGain + input.dividends

  const status = input.filingStatus
  const preTaxBoth = input.section125 + input.retirement401k
  const federalAgi = ordinaryIncome + ltcg - input.hsa - preTaxBoth + input.gtli - capitalLossAllowed
  const stateAgi = ordinaryIncome + ltcg - preTaxBoth + input.gtli + input.employerHsa - capitalLossAllowed

  const propertyTax = input.propertyTax ?? 0
  const mortgageInterest = input.mortgageInterest ?? 0
  const charity = (input.charityCash ?? 0) + (input.charityNonCash ?? 0)

  // Federal: itemize when it beats the standard deduction (plus the non-itemizer cash charity deduction).
  const saltPaid = (input.stateIncomeTaxWithheld ?? 0) + (input.caSdi ?? 0) + (input.stateTaxPayments ?? 0) + propertyTax
  const saltCap = Math.max(
    rules.saltFloor[status],
    rules.saltCap[status] - applyRate(Math.max(0, federalAgi - rules.saltPhaseoutStart[status]), rules.saltPhaseoutRate),
  )
  const federalSaltAllowed = Math.min(saltPaid, saltCap)
  const charityAllowed = Math.max(0, charity - applyRate(Math.max(0, federalAgi), rules.charitableFloorRate))
  const federalItemizedDeduction = federalSaltAllowed + mortgageInterest + charityAllowed
  const federalStandardDeduction = rules.federalStandardDeduction[status]
  const nonItemizerCharity = Math.min(input.charityCash ?? 0, rules.nonItemizerCharityCap[status])
  const federalItemizes = federalItemizedDeduction > federalStandardDeduction + nonItemizerCharity
  const federalDeduction = federalItemizes ? federalItemizedDeduction : federalStandardDeduction + nonItemizerCharity

  // California: no deduction for its own income tax or SDI, and no SALT cap.
  const stateStandardDeduction = rules.californiaStandardDeduction[status]
  const stateItemizedDeduction = propertyTax + mortgageInterest + charity
  const stateDeduction = Math.max(stateStandardDeduction, stateItemizedDeduction)

  return {
    baseSalary: input.salary,
    netShortTerm,
    netLongTerm,
    grossRealized: input.salary + input.shortTermProfit + input.longTermProfit + input.dividends,
    ordinaryIncome,
    ltcgIncome: ltcg,
    capitalLossAllowed,
    federalAgi,
    stateAgi,
    federalStandardDeduction,
    federalNonItemizerCharity: federalItemizes ? 0 : nonItemizerCharity,
    federalSaltAllowed,
    federalItemizedDeduction,
    federalDeduction,
    federalItemizes,
    stateStandardDeduction,
    stateItemizedDeduction,
    stateDeduction,
    // Long-term gains sit on top: the deduction comes out of ordinary income first.
    federalOrdinaryTaxable: Math.max(0, federalAgi - ltcg - federalDeduction),
    stateTaxable: Math.max(0, stateAgi - stateDeduction),
    capitalLossCarryForward: loss - capitalLossAllowed,
    carriedOver,
  }
}

/** A full year of paystubs (Paid Out and projected) rolled into the annual figures the summary needs. */
export function payrollAnnuals(records: PayrollRecord[]) {
  const benefit = (r: PayrollRecord) => r.benefits ?? { medical: 0, dental: 0, vision: 0, healthcareFsa: 0, dependentFsa: 0, hsa: 0, retirement401k: 0 }
  return {
    salary: sum(records.map((r) => r.gross)),
    hsa: sum(records.map((r) => benefit(r).hsa)),
    section125: sum(records.map((r) => benefit(r).medical + benefit(r).dental + benefit(r).vision + benefit(r).healthcareFsa + benefit(r).dependentFsa)),
    // A stub that only carries a lump pre-tax total is treated as 401(k), as the paystub form does.
    retirement401k: sum(records.map((r) => (r.benefits ? r.benefits.retirement401k : r.preTax))),
    gtli: sum(records.map((r) => r.gtli ?? 0)),
    employerHsa: sum(records.map((r) => r.employerHsa ?? 0)),
    stateIncomeTaxWithheld: sum(records.map((r) => r.caWithholding)),
    caSdi: sum(records.map((r) => r.caSdi)),
  }
}

/** Itemized deduction categories entered on the Tax Engine page (household amounts for the year). */
export const DEDUCTION_CATEGORIES = ['property_tax', 'mortgage_interest', 'charity_cash', 'charity_noncash'] as const
export type DeductionCategory = (typeof DEDUCTION_CATEGORIES)[number]

/**
 * Deduction records and California tax payments rolled into the summary's itemized inputs. Taxes are deductible
 * in the year paid, so payments count by date (a prior year's balance paid in April counts; a January estimate doesn't).
 */
export function itemizedAnnuals(taxYear: number, deductions: Deduction[], taxPayments: TaxPayment[]) {
  const of = (category: DeductionCategory) => sum(deductions.filter((d) => d.taxYear === taxYear && d.category === category).map((d) => d.amount))
  return {
    stateTaxPayments: sum(taxPayments.filter((p) => p.jurisdiction === 'ca' && p.date.startsWith(`${taxYear}-`)).map((p) => p.amount)),
    propertyTax: of('property_tax'),
    mortgageInterest: of('mortgage_interest'),
    charityCash: of('charity_cash'),
    charityNonCash: of('charity_noncash'),
  }
}

/** Brokerage rows rolled into profit/loss/dividend totals. */
export function brokerageAnnuals(rows: InvestmentSourceSummary[]) {
  const pl = rows.map((r) => profitLoss(r))
  return {
    shortTermProfit: sum(pl.map((p) => p.shortTerm.profit)),
    shortTermLoss: sum(pl.map((p) => p.shortTerm.loss)),
    longTermProfit: sum(pl.map((p) => p.longTerm.profit)),
    longTermLoss: sum(pl.map((p) => p.longTerm.loss)),
    dividends: sum(rows.map((r) => r.dividendsInterest)),
  }
}
