import type { FilingStatus } from './filing-status'
import { getIncomeRules } from './income-rules'
import { profitLoss } from './investments'
import { sum, type Cents } from './money'
import type { InvestmentSourceSummary, PayrollRecord } from './types'

/*
 * Marc's spreadsheet, in code: salary + brokerage results → ordinary income, LTCG, capital-loss
 * limit, standard deductions and taxable income for one person or the whole household.
 * Taxable income here is before brackets; tax itself comes later.
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
  federalStandardDeduction: Cents
  stateStandardDeduction: Cents
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

  const federalStandardDeduction = rules.federalStandardDeduction[input.filingStatus]
  const stateStandardDeduction = rules.californiaStandardDeduction[input.filingStatus]
  const preTaxBoth = input.section125 + input.retirement401k

  return {
    baseSalary: input.salary,
    netShortTerm,
    netLongTerm,
    grossRealized: input.salary + input.shortTermProfit + input.longTermProfit + input.dividends,
    ordinaryIncome,
    ltcgIncome: ltcg,
    capitalLossAllowed,
    federalStandardDeduction,
    stateStandardDeduction,
    federalOrdinaryTaxable: Math.max(0, ordinaryIncome - input.hsa - preTaxBoth + input.gtli - federalStandardDeduction - capitalLossAllowed),
    stateTaxable: Math.max(0, ordinaryIncome + ltcg - stateStandardDeduction - preTaxBoth + input.gtli + input.employerHsa - capitalLossAllowed),
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
