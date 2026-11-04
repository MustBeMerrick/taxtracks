import type { FilingStatus } from './filing-status'
import { payrollAnnuals } from './income-summary'
import type { Cents } from './money'
import { estimateHouseholdTax } from './tax-liability'
import type { Carryover, Deduction, InvestmentSourceSummary, PayrollRecord, TaxPayment } from './types'

/*
 * Splits the household's jointly filed liability between the spouses. These are internal allocations of one
 * joint return, not separate liabilities the IRS or FTB would determine. The household totals never change;
 * only who carries what.
 *
 *  - Income proportional (default): each jurisdiction's tax × the person's share of personal income
 *    (W-2 wages plus their own brokerage results).
 *  - Source attributed: the tax engine is re-run with each spouse's personal items (their brokerage results and
 *    any deductions they own) left out. The baseline tax with no personal items, T(∅), is split by each
 *    jurisdiction's taxable wages; the increase each spouse's items cause is theirs. With more than one owner the
 *    increase is a Shapley value: each owner's marginal effect averaged over every order of adding owners, so
 *    interactions (brackets, NIIT, loss netting, SALT phaseout) are shared symmetrically and the parts add up
 *    exactly to the joint tax. Joint items (carryovers, household deductions, tax payments) stay in every scenario.
 *
 * Every split is rounded with largest remainders so people add up to the household to the cent.
 */

export type AllocationMethod = 'income_proportional' | 'source_attributed'

export const ALLOCATION_METHODS: { value: AllocationMethod; label: string; description: string }[] = [
  { value: 'income_proportional', label: 'Income proportional', description: 'All joint tax split by each person’s share of total income.' },
  {
    value: 'source_attributed',
    label: 'Source attributed',
    description: 'Baseline tax split by W-2 wages; the extra tax from each person’s own investments goes to that person.',
  },
]

export const DEFAULT_ALLOCATION_METHOD: AllocationMethod = 'income_proportional'

export const isAllocationMethod = (v: unknown): v is AllocationMethod => ALLOCATION_METHODS.some((m) => m.value === v)

export interface Pair {
  federal: Cents
  ca: Cents
}

export interface PersonAllocation {
  /** Share of the baseline tax (all of it, under income proportional). */
  baseline: Pair
  /** Extra tax caused by the person's own investments and deductions (zero under income proportional). */
  investment: Pair
  total: Pair
}

export interface LiabilityAllocation {
  method: AllocationMethod
  household: Pair
  people: Record<string, PersonAllocation>
  /** Set when a fallback policy was used, e.g. nobody had wages so the baseline was split equally. */
  note?: string
}

/**
 * Rounds `raw` amounts (any sign, fractional cents) to whole cents that sum exactly to `total`: floor each,
 * then hand the leftover cents to the largest fractional parts (ties go to the earlier person).
 */
export function roundToTotal(raw: number[], total: Cents): Cents[] {
  const floors = raw.map((v) => Math.floor(v))
  let left = total - floors.reduce((t, v) => t + v, 0)
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  const out = [...floors]
  // `left` can exceed the count (or go negative) only when raw doesn't already sum to total; spread it round-robin.
  for (let k = 0; left !== 0; k++) {
    const { i } = order[k % order.length]
    const step = left > 0 ? 1 : -1
    out[i] += step
    left -= step
  }
  return out
}

/** Unrounded shares of `total` by weights (negatives count as zero); equal shares when every weight is zero. */
function rawSplit(total: number, weights: number[]): number[] {
  const w = weights.map((x) => Math.max(0, x))
  const sum = w.reduce((t, x) => t + x, 0)
  return sum > 0 ? w.map((x) => (total * x) / sum) : w.map(() => total / w.length)
}

/** Splits `total` by weights, in whole cents that add up exactly. */
export function splitByWeights(total: Cents, weights: number[]): Cents[] {
  return roundToTotal(rawSplit(total, weights), total)
}

const pairOf = (federal: Cents, ca: Cents): Pair => ({ federal, ca })

/** Income proportional: every jurisdiction's tax split by personal income. */
export function incomeProportional(household: Pair, ids: string[], income: Record<string, number>): LiabilityAllocation {
  const weights = ids.map((id) => income[id] ?? 0)
  const fed = splitByWeights(household.federal, weights)
  const ca = splitByWeights(household.ca, weights)
  const people: Record<string, PersonAllocation> = {}
  ids.forEach((id, i) => {
    const total = pairOf(fed[i], ca[i])
    people[id] = { baseline: total, investment: pairOf(0, 0), total }
  })
  const note = weights.every((w) => w <= 0) ? 'No one has positive income, so the tax is split equally.' : undefined
  return { method: 'income_proportional', household, people, ...(note ? { note } : {}) }
}

/**
 * Source attributed, from a scenario function: `tax(owners)` is the joint liability with only those people's
 * personal items included. `players` are the people who have personal items; everyone else adds nothing.
 */
export function sourceAttributed(
  ids: string[],
  players: string[],
  tax: (owners: string[]) => Pair,
  wages: Record<string, Pair>,
): LiabilityAllocation {
  // T(S) for every subset of players, keyed by a bitmask.
  const n = players.length
  const memo = new Map<number, Pair>()
  const T = (mask: number) => {
    let v = memo.get(mask)
    if (!v) {
      v = tax(players.filter((_, i) => mask & (1 << i)))
      memo.set(mask, v)
    }
    return v
  }
  const full = T((1 << n) - 1)
  const base = T(0)

  const factorial = (k: number): number => (k <= 1 ? 1 : k * factorial(k - 1))
  const bits = (m: number) => m.toString(2).replace(/0/g, '').length
  const shapley = (j: keyof Pair, p: number) => {
    let value = 0
    for (let mask = 0; mask < 1 << n; mask++) {
      if (mask & (1 << p)) continue
      const s = bits(mask)
      value += ((factorial(s) * factorial(n - s - 1)) / factorial(n)) * (T(mask | (1 << p))[j] - T(mask)[j])
    }
    return value
  }

  const noWages = (j: keyof Pair) => ids.every((id) => (wages[id]?.[j] ?? 0) <= 0)
  const split = (j: keyof Pair) => {
    const baselineRaw = rawSplit(base[j], ids.map((id) => wages[id]?.[j] ?? 0))
    const delta = ids.map((id) => {
      const p = players.indexOf(id)
      return p === -1 ? 0 : shapley(j, p)
    })
    // Baseline and total are each rounded against their joint figure, so both add up exactly; the increment is the difference.
    return { baseline: roundToTotal(baselineRaw, base[j]), total: roundToTotal(baselineRaw.map((v, i) => v + delta[i]), full[j]) }
  }
  const fed = split('federal')
  const ca = split('ca')

  const people: Record<string, PersonAllocation> = {}
  ids.forEach((id, i) => {
    people[id] = {
      baseline: pairOf(fed.baseline[i], ca.baseline[i]),
      investment: pairOf(fed.total[i] - fed.baseline[i], ca.total[i] - ca.baseline[i]),
      total: pairOf(fed.total[i], ca.total[i]),
    }
  })
  const note = noWages('federal') || noWages('ca') ? 'No one has W-2 wages, so the baseline tax is split equally.' : undefined
  return { method: 'source_attributed', household: full, people, ...(note ? { note } : {}) }
}

export interface AllocationRecords {
  taxpayerIds: string[]
  payroll: PayrollRecord[]
  investments: InvestmentSourceSummary[]
  carryovers: Carryover[]
  deductions: Deduction[]
  taxPayments: TaxPayment[]
}

/** W-2 wages + own brokerage results: the income-proportional weight (as the Overview has always used). */
export function personalIncome(id: string, records: Pick<AllocationRecords, 'payroll' | 'investments'>): Cents {
  const wages = records.payroll.filter((r) => r.taxpayerId === id).reduce((t, r) => t + r.gross - r.preTax + (r.gtli ?? 0), 0)
  const brokerage = records.investments.filter((i) => i.owner === id).reduce((t, i) => t + i.shortTerm + i.longTerm + i.dividendsInterest, 0)
  return wages + brokerage
}

/** Taxable wages per jurisdiction (federal Box 1; California also taxes HSA contributions). */
function taxableWages(id: string, payroll: PayrollRecord[]): Pair {
  const p = payrollAnnuals(payroll.filter((r) => r.taxpayerId === id))
  return {
    federal: p.salary - p.hsa - p.section125 - p.retirement401k + p.gtli,
    ca: p.salary - p.section125 - p.retirement401k + p.gtli + p.employerHsa,
  }
}

/**
 * Both allocations of the household's estimated liability, from the year's records. Null when the engine has no
 * tables for the year or filing status. Pure: every scenario filters copies; nothing stored is touched.
 */
export function allocateHouseholdLiability(
  taxYear: number,
  filingStatus: FilingStatus,
  records: AllocationRecords,
): Record<AllocationMethod, LiabilityAllocation> | null {
  const ids = records.taxpayerIds
  const isPerson = (owner: string | undefined) => owner !== undefined && ids.includes(owner)
  const estimate = (owners: string[]): Pair | null => {
    const result = estimateHouseholdTax(taxYear, filingStatus, {
      ...records,
      investments: records.investments.filter((i) => !isPerson(i.owner) || owners.includes(i.owner!)),
      deductions: records.deductions.filter((d) => !isPerson(d.owner) || owners.includes(d.owner)),
    })
    return result && pairOf(result.estimate.federal.total, result.estimate.california.total)
  }
  const full = estimate(ids)
  if (!full) return null

  const players = ids.filter((id) => records.investments.some((i) => i.owner === id) || records.deductions.some((d) => d.owner === id))
  const income = Object.fromEntries(ids.map((id) => [id, personalIncome(id, records)]))
  const wages = Object.fromEntries(ids.map((id) => [id, taxableWages(id, records.payroll)]))
  return {
    income_proportional: incomeProportional(full, ids, income),
    source_attributed: sourceAttributed(ids, players, (owners) => estimate(owners)!, wages),
  }
}

/**
 * Joint tax payments (estimated, extension) for a jurisdiction, split in proportion to each person's allocated
 * liability there — falling back to equal shares when no one has liability. Payments carry no owner.
 */
export function allocateJointPayments(total: Cents, ids: string[], liability: (id: string) => Cents): Cents[] {
  return splitByWeights(total, ids.map(liability))
}
