'use client'

import { useState } from 'react'
import { setAllocationMethod } from '@/app/actions'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/controls'
import { ALLOCATION_METHODS, type AllocationMethod } from '@/lib/core/liability-allocation'
import { formatMoney, formatPercent, type Cents } from '@/lib/core/money'
import type { BracketView, EffectiveRates, VisualizationData, VizFiling, VizJurisdiction } from '@/lib/core/visualization'
import { BracketChart, colorFor } from '@/components/visualization/BracketChart'
import '@/components/overview/overview.css'
import '@/components/visualization/visualization.css'

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
  rates,
  initialFiling,
  initialMethod,
}: {
  data: VisualizationData
  rates: EffectiveRates
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
  const personRates = filing === 'separate' ? rates.separate : rates.joint?.[method]
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
            Taxable income (after deductions). Dashed lines are bracket edges: the dollar amount on the left, the rate above it on the right.
            {jurisdiction === 'federal' ? ' Long-term gains sit on top and are taxed at the capital gains rates.' : ''} The filing toggle here is a preview; the
            year’s filing status is set in the top bar.
          </p>
        </Card>

        <div className="tt-viz-side">
          <SplitBasisCard view={view} people={people} income={data.income} />
          <Card title="Bracket tax in this picture">
            <div className="tt-table-scroll">
              <table className="tt-table tt-table--compact">
                <thead>
                  <tr>
                    <th scope="col" />
                    <th scope="col">Taxable income</th>
                    <th scope="col">Bracket tax</th>
                    <th scope="col">Average rate</th>
                    <th scope="col">Effective rate</th>
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
                        <td>{personRates?.[p.id] ? formatPercent(personRates[p.id][jurisdiction]) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="tt-chart-caption">
              Average rate: the bracket tax{jurisdiction === 'federal' ? ' (with capital gains rates)' : ''} over taxable income. Effective rate: their whole
              share of the liability, including{jurisdiction === 'federal' ? ' the 3.8% investment income tax, Additional Medicare and' : ''} credits, over total
              income before deductions, as on the Overview.
            </p>
          </Card>
        </div>
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

function basisNote(view: BracketView): string {
  if (!view.basis.split) return 'Filing separately, nothing is divided: each return is taxed on its own income.'
  switch (view.method) {
    case 'income_proportional':
      return 'Each bracket slice of the joint return is split by these shares.'
    case 'source_attributed':
      return 'Each wage slice of the joint return is split by these shares. Brokerage income sits on top and is its owner’s alone.'
    default:
      return `The joint ${view.jurisdiction === 'federal' ? 'federal' : 'California'} bill is split in proportion to the tax each would owe on their own return.`
  }
}

/** Each person's total income and what the current picture divides by, with the shares it gives. */
function SplitBasisCard({ view, people, income }: { view: BracketView; people: { id: string; name: string }[]; income: Record<string, Cents> }) {
  const basis = view.basis
  const measure = basis.amounts ?? income
  const weights = people.map((p) => Math.max(0, measure[p.id] ?? 0))
  const total = weights.reduce((t, w) => t + w, 0)
  const shares = weights.map((w) => (total > 0 ? w / total : 1 / people.length))
  const whole = (c: Cents | undefined) => formatMoney(c ?? 0, { precision: 'whole' })
  const row = (label: string, cell: (id: string, i: number) => string) => (
    <tr>
      <th scope="row">{label}</th>
      {people.map((p, i) => (
        <td key={p.id}>{cell(p.id, i)}</td>
      ))}
    </tr>
  )

  return (
    <Card title="Income and shares">
      {basis.split && (
        <div className="tt-viz-share" role="img" aria-label={people.map((p, i) => `${p.name} ${formatPercent(shares[i])}`).join(', ')}>
          {people.map((p, i) => (shares[i] > 0 ? <span key={p.id} style={{ flexGrow: shares[i], background: colorFor(i) }} /> : null))}
        </div>
      )}
      <div className="tt-table-scroll">
        <table className="tt-table tt-table--compact">
          <thead>
            <tr>
              <th scope="col" />
              {people.map((p, i) => (
                <th key={p.id} scope="col">
                  <i className="tt-key" style={{ background: colorFor(i) }} /> {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row('Total income', (id) => whole(income[id]))}
            {basis.amounts && row(basis.label, (id) => whole(basis.amounts?.[id]))}
            {basis.split && row(basis.amounts ? 'Share' : 'Share of income', (_, i) => formatPercent(shares[i]))}
            {basis.owned && row('Own brokerage income', (id) => whole(basis.owned?.[id]))}
          </tbody>
        </table>
      </div>
      <p className="tt-chart-caption">{basisNote(view)}</p>
    </Card>
  )
}
