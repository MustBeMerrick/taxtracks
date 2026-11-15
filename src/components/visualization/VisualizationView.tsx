'use client'

import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { setAllocationMethod } from '@/app/actions'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/controls'
import { ALLOCATION_METHODS, type AllocationMethod } from '@/lib/core/liability-allocation'
import { formatMoney, formatPercent } from '@/lib/core/money'
import type { BracketView, Segment, SegmentKind, VisualizationData, VizFiling, VizJurisdiction } from '@/lib/core/visualization'
import '@/components/overview/overview.css'
import '@/components/visualization/visualization.css'

const dollars = (c: number) => c / 100
const rateLabel = (r: number) => `${+(r * 100).toFixed(1)}%`

const KIND_LABELS: Record<SegmentKind, string> = {
  income: 'Income',
  wages: 'Wages',
  investments: 'Investment income',
  ltcg: 'Long-term gains',
}

/** Person colors follow the taxpayer order (series 1, 2, …), never the bar they sit in. */
const colorFor = (index: number) => `var(--series-${(index % 4) + 1})`

function caption(view: BracketView, names: string): string {
  if (view.filing === 'separate') return 'Married filing separately: two returns, each against its own brackets (half the joint ones, for most of the range).'
  switch (view.method) {
    case 'income_proportional':
      return `Joint return. Each bracket’s slice is split by share of income, so ${names} pay the same average rate.`
    case 'source_attributed':
      return 'Joint return. Wage income in each bracket is split by taxable wages; the income each person’s own investments add sits on top and is theirs.'
    default:
      return 'Joint return, split as if separate: each person against their own separate-return brackets. Their share of the joint bill follows these, scaled to the joint total.'
  }
}

export function VisualizationView({
  data,
  initialFiling,
  initialMethod,
}: {
  data: VisualizationData
  initialFiling: VizFiling
  initialMethod: AllocationMethod
}) {
  const [jurisdiction, setJurisdiction] = useState<VizJurisdiction>('federal')
  const [filing, setFiling] = useState<VizFiling>(initialFiling)
  const [method, setMethod] = useState<AllocationMethod>(initialMethod)

  function changeMethod(next: AllocationMethod) {
    setMethod(next)
    // Shared with the Overview's split; a failed save only loses the preference.
    setAllocationMethod(next).catch(() => {})
  }

  const view = filing === 'separate' ? data.separate?.[jurisdiction] : data.joint?.[jurisdiction][method]
  if (!view) {
    return (
      <Card title="Visualization">
        <p className="tt-muted">No tax brackets are on file for {data.taxYear} yet.</p>
      </Card>
    )
  }

  const people = data.people
  const names = people.map((p) => p.name).join(' and ')

  return (
    <div className="tt-viz">
      <div className="tt-viz-controls">
        <Segmented
          label="Jurisdiction"
          value={jurisdiction}
          options={[
            { value: 'federal', label: 'Federal' },
            { value: 'ca', label: 'California' },
          ]}
          onChange={setJurisdiction}
        />
        <Segmented
          label="Filing status (preview)"
          value={filing}
          options={[
            { value: 'joint', label: 'Jointly' },
            { value: 'separate', label: 'Separately' },
          ]}
          onChange={setFiling}
        />
        {filing === 'joint' && (
          <Segmented label="Split method" value={method} options={ALLOCATION_METHODS.map((m) => ({ value: m.value, label: m.shortLabel }))} onChange={changeMethod} />
        )}
      </div>

      <div className="tt-viz-grid">
        <Card
          className="tt-viz-main"
          title={`Income in the ${jurisdiction === 'federal' ? 'federal' : 'California'} brackets, ${data.taxYear}`}
        >
          <p className="tt-viz-caption">{caption(view, names)}</p>
          <Legend view={view} people={people} />
          <BracketChart view={view} people={people} />
          <p className="tt-chart-caption">
            Taxable income (after deductions). Dashed lines are bracket edges, labeled with the rate above them.
            {jurisdiction === 'federal' ? ' Long-term gains sit on top and are taxed at the capital gains rates.' : ''} The filing toggle here is a preview; the
            year’s filing status is set in the top bar.
          </p>
        </Card>

        <Card className="tt-viz-side" title="Bracket tax in this picture">
          <div className="tt-table-scroll">
            <table className="tt-table tt-table--compact">
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col">Taxable income</th>
                  <th scope="col">Bracket tax</th>
                  <th scope="col">Average rate</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const income = view.bars.flatMap((b) => b.segments).filter((s) => s.person === p.id).reduce((t, s) => t + s.to - s.from, 0)
                  const tax = view.taxByPerson[p.id] ?? 0
                  return (
                    <tr key={p.id}>
                      <th scope="row">{p.name}</th>
                      <td>{formatMoney(income, { precision: 'whole' })}</td>
                      <td>{formatMoney(tax, { precision: 'whole' })}</td>
                      <td>{income > 0 ? formatPercent(tax / income) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="tt-chart-caption">
            Tax from the brackets{jurisdiction === 'federal' ? ' and capital gains rates' : ''} only. The Overview’s shares also count the 3.8% investment income tax,
            Additional Medicare and credits, so they differ a little.
          </p>
        </Card>
      </div>
    </div>
  )
}

function Legend({ view, people }: { view: BracketView; people: { id: string; name: string }[] }) {
  const kinds = new Set(view.bars.flatMap((b) => b.segments.map((s) => s.kind)))
  return (
    <div className="tt-chart-legend">
      {people.map((p, i) => (
        <span key={p.id}>
          <i className="tt-key" style={{ background: colorFor(i) }} /> {p.name}
        </span>
      ))}
      {kinds.has('investments') && (
        <span>
          <i className="tt-key tt-viz-key--investments" /> Investment income
        </span>
      )}
      {kinds.has('ltcg') && (
        <span>
          <i className="tt-key tt-viz-key--ltcg" /> Long-term gains
        </span>
      )}
      <span>
        <i className="tt-key tt-viz-key--line" /> Bracket edge
      </span>
    </div>
  )
}

/** Hatched fills: the person's color, 45° for investment income and 135° for long-term gains. */
function Patterns({ people }: { people: { id: string }[] }) {
  return (
    <defs>
      {people.flatMap((p, i) =>
        (['investments', 'ltcg'] as const).map((kind) => (
          <pattern
            key={`${p.id}-${kind}`}
            id={`tt-viz-${p.id}-${kind}`}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${kind === 'investments' ? 45 : 135})`}
          >
            <rect width={6} height={6} fill={colorFor(i)} fillOpacity={0.35} />
            <line x1={0} y1={0} x2={0} y2={6} stroke={colorFor(i)} strokeWidth={3} />
          </pattern>
        )),
      )}
    </defs>
  )
}

function BracketChart({ view, people }: { view: BracketView; people: { id: string; name: string }[] }) {
  const segments = view.bars.flatMap((b) => b.segments)
  const byId = new Map(segments.map((s) => [s.id, s]))
  const indexOf = (id: string) => Math.max(0, people.findIndex((p) => p.id === id))
  const fillOf = (s: Segment) => (s.kind === 'investments' || s.kind === 'ltcg' ? `url(#tt-viz-${s.person}-${s.kind})` : colorFor(indexOf(s.person)))
  const data = view.bars.map((b) => ({ label: b.label, ...Object.fromEntries(b.segments.map((s) => [s.id, dollars(s.to - s.from)])) }))

  // Show the next bracket edge above the tallest bar when it's near enough to read headroom against.
  const top = Math.max(...view.bars.map((b) => b.total), 1)
  const next = view.lines.find((l) => l.at > top)
  const yMax = dollars(next && next.at < top * 1.6 ? Math.max(next.at * 1.06, top * 1.08) : top * 1.1)
  const lines = view.lines.filter((l) => dollars(l.at) <= yMax)
  const firstRate = segments.find((s) => s.kind !== 'ltcg' && s.from === 0)?.rate

  return (
    <div className="tt-viz-plot" role="img" aria-label={summary(view, people)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 48, bottom: 0, left: 0 }} barCategoryGap="28%">
          <Patterns people={people} />
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.4} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fill: 'var(--text-secondary)', fontSize: 13 }} />
          <YAxis
            domain={[0, yMax]}
            allowDataOverflow
            width={56}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            tickFormatter={(v: number) => formatMoney(v * 100, { precision: 'compact' })}
          />
          <Tooltip content={(props) => <SegmentTooltip {...props} byId={byId} people={people} />} shared={false} cursor={false} />
          {segments.map((s) => (
            <Bar key={s.id} dataKey={s.id} stackId="income" fill={fillOf(s)} stroke="var(--surface)" strokeWidth={2} maxBarSize={120} isAnimationActive={false} />
          ))}
          {firstRate !== undefined && (
            <ReferenceLine y={0} stroke="none" label={{ value: rateLabel(firstRate), position: 'insideBottomRight', fill: 'var(--text-muted)', fontSize: 11 }} />
          )}
          {lines.map((l) => (
            <ReferenceLine
              key={l.at}
              y={dollars(l.at)}
              stroke="var(--text-muted)"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              ifOverflow="hidden"
              label={{ value: rateLabel(l.rate), position: 'right', fill: 'var(--text-secondary)', fontSize: 11 }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function summary(view: BracketView, people: { id: string; name: string }[]): string {
  const parts = view.bars.map((b) => `${b.label}: ${formatMoney(b.total, { precision: 'whole' })} of taxable income`)
  const tax = people.map((p) => `${p.name} ${formatMoney(view.taxByPerson[p.id] ?? 0, { precision: 'whole' })}`)
  return `Stacked bars of taxable income against the tax brackets. ${parts.join('; ')}. Bracket tax: ${tax.join(', ')}.`
}

function SegmentTooltip({
  active,
  payload,
  byId,
  people,
}: TooltipContentProps & { byId: Map<string, Segment>; people: { id: string; name: string }[] }) {
  const key = payload?.[0]?.dataKey
  const s = typeof key === 'string' ? byId.get(key) : undefined
  if (!active || !s) return null
  return (
    <div className="tt-tooltip">
      <strong>
        {people.find((p) => p.id === s.person)?.name ?? s.person} · {KIND_LABELS[s.kind]}
      </strong>
      <dl>
        <dt>Slice</dt>
        <dd>
          {formatMoney(s.from, { precision: 'whole' })} – {formatMoney(s.to, { precision: 'whole' })}
        </dd>
        <dt>Amount</dt>
        <dd>{formatMoney(s.to - s.from, { precision: 'whole' })}</dd>
        <dt>{s.kind === 'ltcg' ? 'Capital gains rate' : 'Bracket'}</dt>
        <dd>{rateLabel(s.rate)}</dd>
        <dt>Tax on it</dt>
        <dd>{formatMoney(s.tax, { precision: 'whole' })}</dd>
      </dl>
    </div>
  )
}
