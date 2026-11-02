import type { Cents } from './money'
import type { InvestmentSourceSummary, Provenance } from './types'

/*
 * Brokerage results entered per person from year-end 1099s (or estimates before they arrive).
 * Every brokerage reports dividends and short/long-term P/L, except Fundrise, which reports total
 * dividends and NAV distributions (treated as long-term).
 */

export interface Brokerage {
  key: string
  name: string
  /** Fundrise: no short-term column; the long-term box holds NAV distributions. */
  navDistributions?: boolean
}

export const BROKERAGES: readonly Brokerage[] = [
  { key: 'betterment', name: 'Betterment' },
  { key: 'lpl', name: 'LPL' },
  { key: 'robinhood', name: 'Robinhood' },
  { key: 'vanguard', name: 'Vanguard' },
  { key: 'wealthfront', name: 'Wealthfront' },
  { key: 'fundrise', name: 'Fundrise', navDistributions: true },
]

export const brokerageByKey = (key: string) => BROKERAGES.find((b) => b.key === key)

export const investmentId = (year: number, owner: string, brokerage: string) => `inv-${year}-${owner}-${brokerage}`

/** What the Income page submits for one person's brokerage (and what the server re-validates). */
export interface InvestmentEntryInput {
  taxpayerId: string
  brokerage: string
  /** All non-negative cents: profit and loss are entered separately and netted per term. */
  dividends: Cents
  shortTermProfit: Cents
  shortTermLoss: Cents
  longTermProfit: Cents
  longTermLoss: Cents
  /** True once the 1099 is in and the numbers are final; false for estimates. */
  final: boolean
}

export type InvestmentEntryValidation =
  | { ok: true; fields: Pick<
        InvestmentSourceSummary,
        'owner' | 'brokerage' | 'name' | 'shortTerm' | 'longTerm' | 'shortTermProfit' | 'shortTermLoss' | 'longTermProfit' | 'longTermLoss' | 'dividendsInterest' | 'status' | 'taxYear'
      > }
  | { ok: false; error: string }

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n)

export function validateInvestmentEntry(input: InvestmentEntryInput, knownTaxpayerIds: string[], taxYear: number): InvestmentEntryValidation {
  if (!knownTaxpayerIds.includes(input.taxpayerId)) return { ok: false, error: 'Unknown person.' }
  const brokerage = brokerageByKey(input.brokerage)
  if (!brokerage) return { ok: false, error: 'Unknown brokerage.' }
  const amounts = [input.dividends, input.shortTermProfit, input.shortTermLoss, input.longTermProfit, input.longTermLoss]
  if (!amounts.every(isInt)) return { ok: false, error: 'Enter dollar amounts.' }
  if (amounts.some((n) => n < 0)) return { ok: false, error: 'Enter profits and losses as positive amounts.' }
  if (brokerage.navDistributions && (input.shortTermProfit !== 0 || input.shortTermLoss !== 0 || input.longTermLoss !== 0)) {
    return { ok: false, error: `${brokerage.name} reports only dividends and NAV distributions.` }
  }
  const status: Provenance = input.final ? 'actual' : 'manual_estimate'
  return {
    ok: true,
    fields: {
      taxYear,
      owner: input.taxpayerId,
      brokerage: brokerage.key,
      name: brokerage.name,
      shortTerm: input.shortTermProfit - input.shortTermLoss,
      longTerm: input.longTermProfit - input.longTermLoss,
      shortTermProfit: input.shortTermProfit,
      shortTermLoss: input.shortTermLoss,
      longTermProfit: input.longTermProfit,
      longTermLoss: input.longTermLoss,
      dividendsInterest: input.dividends,
      status,
    },
  }
}

export const entryTotal = (r: { shortTerm: Cents; longTerm: Cents; dividendsInterest: Cents }): Cents =>
  r.shortTerm + r.longTerm + r.dividendsInterest

/** The saved row for one person's brokerage, if any. Should be unique; if not, the newest edit wins. */
export function findEntry(records: InvestmentSourceSummary[], owner: string, brokerage: string) {
  return matchingEntries(records, owner, brokerage)[0]
}

/** Every row for that person and brokerage, newest edit first. */
export function matchingEntries(records: InvestmentSourceSummary[], owner: string, brokerage: string) {
  return records.filter((r) => r.owner === owner && r.brokerage === brokerage).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** The profit and loss boxes for a saved row; rows that only carry a net show it on the matching side. */
export function profitLoss(r?: Pick<InvestmentSourceSummary, 'shortTerm' | 'longTerm' | 'shortTermProfit' | 'shortTermLoss' | 'longTermProfit' | 'longTermLoss'>) {
  const split = (net: Cents, profit?: Cents, loss?: Cents) =>
    profit !== undefined || loss !== undefined ? { profit: profit ?? 0, loss: loss ?? 0 } : { profit: Math.max(net, 0), loss: Math.max(-net, 0) }
  return {
    shortTerm: split(r?.shortTerm ?? 0, r?.shortTermProfit, r?.shortTermLoss),
    longTerm: split(r?.longTerm ?? 0, r?.longTermProfit, r?.longTermLoss),
  }
}

/** Cents → the text shown in a box; zero shows empty so untouched rows stay blank. */
export function centsToInput(value: Cents): string {
  if (value === 0) return ''
  const abs = Math.abs(value)
  const text = (abs / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return value < 0 ? `-${text}` : text
}
