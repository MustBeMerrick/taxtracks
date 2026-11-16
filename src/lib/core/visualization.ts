import { getIncomeRules } from './income-rules'
import type { IncomeSummary } from './income-summary'
import { personalIncome, taxableWages, type AllocationMethod, type LiabilityAllocation } from './liability-allocation'
import { applyRate, cents, type Cents } from './money'
import { buildOverview, type OverviewInput } from './overview'
import { estimateHouseholdTax, estimateSeparateReturns, type HouseholdRecords } from './tax-liability'

/*
 * The Visualization page's model: taxable income drawn as stacked bars against the tax brackets, with every slice
 * colored by who carries it. Pure; the chart only draws what this returns.
 *
 *  - Joint, by income:     one household bar; each bracket's slice is split by each person's share of income.
 *  - Joint, by source:     one household bar; the wages-only taxable income is split by taxable wages in each bracket,
 *                          and the income each person's own investments add sits on top, marked as theirs.
 *  - Joint, as if separate, and filing separately: one bar per person, each against their own (separate) brackets.
 *
 * Slices show where income falls; the Overview's shares also include the 3.8% investment income tax, Additional
 * Medicare and credits, so the bracket tax here is close to, not exactly, each person's share.
 */

export type VizJurisdiction = 'federal' | 'ca'
export type VizFiling = 'joint' | 'separate'
export type SegmentKind = 'income' | 'wages' | 'investments' | 'ltcg'

export interface Segment {
  /** Stable within a view: the chart's data key. */
  id: string
  person: string
  kind: SegmentKind
  from: Cents
  to: Cents
  /** The marginal rate on this slice (long-term gains: the blended capital gains rate). */
  rate: number
  tax: Cents
}

export interface BracketBar {
  key: string
  label: string
  segments: Segment[]
  total: Cents
}

export interface BracketLine {
  at: Cents
  /** Rate on income above this line. */
  rate: number
}

export interface BracketView {
  jurisdiction: VizJurisdiction
  filing: VizFiling
  /** The split method shown (joint only; null filing separately). */
  method: AllocationMethod | null
  lines: BracketLine[]
  bars: BracketBar[]
  /** Bracket tax (and capital gains tax) per person in this picture. */
  taxByPerson: Record<string, Cents>
}

export interface VisualizationData {
  taxYear: number
  people: { id: string; name: string }[]
  joint: Record<VizJurisdiction, Record<AllocationMethod, BracketView>> | null
  separate: Record<VizJurisdiction, BracketView> | null
}

interface Band {
  from: Cents
  to: Cents
  rate: number
}

interface Layer {
  person: string
  kind: SegmentKind
  amount: Cents
}

/** Brackets as bands in cents: federal rows are already cents; California rows are dollars. */
function bandsFor(taxYear: number, jurisdiction: VizJurisdiction, status: 'mfj' | 'mfs'): Band[] | null {
  const rules = getIncomeRules(taxYear)
  const rows =
    jurisdiction === 'federal'
      ? rules?.federalBrackets[status]?.map((b) => ({ over: b.over, rate: b.rate }))
      : rules?.californiaRates[status]?.map((r) => ({ over: cents(r.over), rate: r.rate }))
  if (!rows) return null
  return rows.map((r, i) => ({ from: r.over, to: rows[i + 1]?.over ?? Infinity, rate: r.rate }))
}

const linesOf = (bands: Band[]): BracketLine[] => bands.slice(1).map((b) => ({ at: b.from, rate: b.rate }))

/** Contiguous layers stacked from `start` upward, cut wherever they cross a bracket edge. */
function cutLayers(prefix: string, layers: Layer[], bands: Band[], start: Cents = 0): Segment[] {
  const out: Segment[] = []
  let at = start
  layers.forEach((layer, li) => {
    const end = at + Math.max(0, layer.amount)
    bands.forEach((band, bi) => {
      const from = Math.max(at, band.from)
      const to = Math.min(end, band.to)
      if (to > from)
        out.push({ id: `${prefix}-${li}-${bi}`, person: layer.person, kind: layer.kind, from, to, rate: band.rate, tax: applyRate(to - from, band.rate) })
    })
    at = end
  })
  return out
}

/** One bracket slice split between people by weight (largest remainder, so slices add up to the cent). */
function splitSlice(amount: Cents, ids: string[], weights: number[]): Cents[] {
  const w = weights.map((x) => Math.max(0, x))
  const sum = w.reduce((t, x) => t + x, 0)
  const raw = sum > 0 ? w.map((x) => (amount * x) / sum) : w.map(() => amount / ids.length)
  const floors = raw.map(Math.floor)
  let left = amount - floors.reduce((t, x) => t + x, 0)
  const order = raw.map((v, i) => ({ i, f: v - Math.floor(v) })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (let k = 0; left > 0; k++, left--) floors[order[k % order.length].i]++
  return floors
}

/** Income from `from` to `to`, each bracket's slice split between people by weight. */
function proportional(prefix: string, from: Cents, to: Cents, ids: string[], weights: number[], kind: SegmentKind, bands: Band[]): Segment[] {
  const out: Segment[] = []
  bands.forEach((band, bi) => {
    const lo = Math.max(from, band.from)
    const hi = Math.min(to, band.to)
    if (hi <= lo) return
    let at = lo
    splitSlice(hi - lo, ids, weights).forEach((amount, pi) => {
      if (amount <= 0) return
      out.push({ id: `${prefix}-${bi}-${ids[pi]}`, person: ids[pi], kind, from: at, to: at + amount, rate: band.rate, tax: applyRate(amount, band.rate) })
      at += amount
    })
  })
  return out
}

/** Long-term gains stacked above ordinary income, taxed at the capital gains rates (federal only). */
function gainsSegments(prefix: string, base: Cents, ids: string[], amounts: Cents[], gainsTax: Cents): Segment[] {
  const total = amounts.reduce((t, a) => t + Math.max(0, a), 0)
  if (total <= 0) return []
  const taxes = splitSlice(gainsTax, ids, amounts)
  let at = base
  return ids.flatMap((person, i) => {
    const amount = Math.max(0, amounts[i])
    if (amount <= 0) return []
    const seg: Segment = { id: `${prefix}-${person}`, person, kind: 'ltcg', from: at, to: at + amount, rate: taxes[i] / amount, tax: taxes[i] }
    at += amount
    return [seg]
  })
}

/** Taxable income in this jurisdiction, and the part of it (ordinary, for federal) that is not wages. */
function taxableParts(summary: IncomeSummary, jurisdiction: VizJurisdiction) {
  if (jurisdiction === 'federal') {
    const taxable = summary.federalOrdinaryTaxable
    const investment = Math.max(0, summary.ordinaryIncome - summary.baseSalary - summary.capitalLossAllowed)
    return { taxable, investment: Math.min(taxable, investment), ltcg: summary.ltcgIncome }
  }
  const taxable = summary.stateTaxable
  const investment = Math.max(0, summary.ordinaryIncome - summary.baseSalary + summary.ltcgIncome - summary.capitalLossAllowed)
  return { taxable, investment: Math.min(taxable, investment), ltcg: 0 }
}

function taxBy(segments: Segment[], ids: string[]): Record<string, Cents> {
  return Object.fromEntries(ids.map((id) => [id, segments.filter((s) => s.person === id).reduce((t, s) => t + s.tax, 0)]))
}

const barOf = (key: string, label: string, segments: Segment[]): BracketBar => ({
  key,
  label,
  segments,
  total: segments.reduce((t, s) => Math.max(t, s.to), 0),
})

/** One bar per person, each against the separate-return brackets: wages, then investments, then long-term gains. */
function separateView(
  taxYear: number,
  jurisdiction: VizJurisdiction,
  people: { id: string; name: string }[],
  returns: NonNullable<ReturnType<typeof estimateSeparateReturns>>,
  method: AllocationMethod | null,
): BracketView | null {
  const bands = bandsFor(taxYear, jurisdiction, 'mfs')
  if (!bands) return null
  const ids = people.map((p) => p.id)
  const bars = people.map((p) => {
    const r = returns.people[p.id]
    const parts = taxableParts(r.summary, jurisdiction)
    const segments = cutLayers(`${p.id}`, [
      { person: p.id, kind: 'wages', amount: parts.taxable - parts.investment },
      { person: p.id, kind: 'investments', amount: parts.investment },
    ], bands)
    const gains = jurisdiction === 'federal' ? gainsSegments(`${p.id}-lt`, parts.taxable, [p.id], [parts.ltcg], r.estimate.federal.capitalGainsTax) : []
    return barOf(p.id, p.name, [...segments, ...gains])
  })
  return { jurisdiction, filing: method ? 'joint' : 'separate', method, lines: linesOf(bands), bars, taxByPerson: taxBy(bars.flatMap((b) => b.segments), ids) }
}

/** Every picture the page can show for a year. Null parts where the year has no tables. */
export function buildVisualization(taxYear: number, people: { id: string; name: string }[], records: HouseholdRecords): VisualizationData {
  const ids = people.map((p) => p.id)
  const recs = { ...records, taxpayerIds: ids }
  const separateReturns = estimateSeparateReturns(taxYear, recs)
  const separate = separateReturns
    ? {
        federal: separateView(taxYear, 'federal', people, separateReturns, null)!,
        ca: separateView(taxYear, 'ca', people, separateReturns, null)!,
      }
    : null

  const full = estimateHouseholdTax(taxYear, 'mfj', recs)
  const isPerson = (owner: string | undefined) => owner !== undefined && ids.includes(owner)
  const wagesOnly = estimateHouseholdTax(taxYear, 'mfj', {
    ...recs,
    investments: recs.investments.filter((i) => !isPerson(i.owner)),
    deductions: recs.deductions.filter((d) => !isPerson(d.owner)),
  })

  const jointView = (jurisdiction: VizJurisdiction): Record<AllocationMethod, BracketView> | null => {
    const bands = bandsFor(taxYear, jurisdiction, 'mfj')
    if (!full || !wagesOnly || !bands || !separateReturns) return null
    const lines = linesOf(bands)
    const parts = taxableParts(full.summary, jurisdiction)
    const gainsTax = jurisdiction === 'federal' ? full.estimate.federal.capitalGainsTax : 0
    const label = people.map((p) => p.name).join(' + ')

    // By income: every slice split by personal income.
    const income = ids.map((id) => personalIncome(id, recs))
    const byIncome = [
      ...proportional('inc', 0, parts.taxable, ids, income, 'income', bands),
      ...(jurisdiction === 'federal' ? gainsSegments('inc-lt', parts.taxable, ids, splitSlice(parts.ltcg, ids, income), gainsTax) : []),
    ]

    // By source: the wages-only household split by taxable wages; what each person's investments add on top is theirs.
    const base = taxableParts(wagesOnly.summary, jurisdiction).taxable
    const wages = ids.map((id) => taxableWages(id, recs.payroll)[jurisdiction])
    const owned = (pick: (i: (typeof recs.investments)[number]) => number) =>
      ids.map((id) => recs.investments.filter((i) => i.owner === id).reduce((t, i) => t + Math.max(0, pick(i)), 0))
    // Ordinary investment income each person adds (federal: short-term + dividends; California: all of it).
    const addsOrdinary = jurisdiction === 'federal' ? owned((i) => i.shortTerm + i.dividendsInterest) : owned((i) => i.shortTerm + i.longTerm + i.dividendsInterest)
    const increment = Math.max(0, parts.taxable - base)
    const incrementShares = splitSlice(increment, ids, addsOrdinary)
    const bySource = [
      ...proportional('src', 0, Math.min(base, parts.taxable), ids, wages, 'wages', bands),
      ...cutLayers('src-inv', ids.map((id, i) => ({ person: id, kind: 'investments' as const, amount: incrementShares[i] })), bands, Math.min(base, parts.taxable)),
      ...(jurisdiction === 'federal' ? gainsSegments('src-lt', parts.taxable, ids, splitSlice(parts.ltcg, ids, owned((i) => i.longTerm)), gainsTax) : []),
    ]

    const view = (method: AllocationMethod, segments: Segment[]): BracketView => ({
      jurisdiction,
      filing: 'joint',
      method,
      lines,
      bars: [barOf('household', label, segments)],
      taxByPerson: taxBy(segments, ids),
    })
    return {
      income_proportional: view('income_proportional', byIncome),
      source_attributed: view('source_attributed', bySource),
      as_if_separate: separateView(taxYear, jurisdiction, people, separateReturns, 'as_if_separate')!,
    }
  }

  const fed = jointView('federal')
  const ca = jointView('ca')
  return { taxYear, people, joint: fed && ca ? { federal: fed, ca } : null, separate }
}

/** Each person's effective rate per jurisdiction: their liability over their total income, exactly as the Overview shows it. */
export type PersonRates = Record<string, { federal: number; ca: number }>

export interface EffectiveRates {
  joint: Record<AllocationMethod, PersonRates> | null
  separate: PersonRates | null
}

/**
 * Effective rates for every picture the page can show: each split of a joint return, and separate returns. Built from
 * the Overview's own model, so a person's rate here is the one their Overview shows under the same settings.
 */
export function effectiveRates(
  input: OverviewInput,
  joint: Record<AllocationMethod, LiabilityAllocation> | null,
  separate: Record<string, { federal: Cents; ca: Cents }> | null,
): EffectiveRates {
  const ids = input.taxpayers.map((t) => t.id)
  const ratesFor = (patch: Pick<OverviewInput, 'allocation' | 'separateReturns'>): PersonRates =>
    Object.fromEntries(
      ids.map((id) => {
        const { federal, ca } = buildOverview({ ...input, ...patch }, id).effectiveRates
        return [id, { federal, ca }]
      }),
    )
  return {
    joint: joint
      ? (Object.fromEntries(Object.entries(joint).map(([method, allocation]) => [method, ratesFor({ allocation, separateReturns: undefined })])) as Record<
          AllocationMethod,
          PersonRates
        >)
      : null,
    separate: separate ? ratesFor({ allocation: undefined, separateReturns: separate }) : null,
  }
}
