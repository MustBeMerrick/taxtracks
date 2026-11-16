'use client'

import { useState } from 'react'
import { setAllocationMethod } from '@/app/actions'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/controls'
import { ALLOCATION_METHODS, type AllocationMethod } from '@/lib/core/liability-allocation'
import { formatMoney, formatPercent } from '@/lib/core/money'
import type { BracketView, VisualizationData, VizFiling, VizJurisdiction } from '@/lib/core/visualization'
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
            Taxable income (after deductions). Dashed lines are bracket edges: the dollar amount on the left, the rate above it on the right.
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
