'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Cell, Pie, PieChart, Tooltip, type TooltipContentProps } from 'recharts'
import { Card, ProvenanceBadge } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/controls'
import { formatMoney, formatPercent, ratio } from '@/lib/core/money'
import type { IncomeComponent, OverviewModel } from '@/lib/core/overview'

// Fixed slot per component so colors never shift with filtering.
const SERIES: Record<IncomeComponent['key'], string> = {
  wages: 'var(--series-1)',
  shortTerm: 'var(--series-2)',
  longTerm: 'var(--series-3)',
  dividendsInterest: 'var(--series-4)',
  other: 'var(--series-other)',
}

export function IncomeComposition({ model }: { model: OverviewModel }) {
  const [mode, setMode] = useState<'amount' | 'percent'>('amount')
  const router = useRouter()
  const { components, total, excludesJointIncome } = model.income
  // Losses can't be donut slices; they're listed as signed offsets instead.
  const slices = components.filter((c) => c.amount > 0)
  const hasOffsets = components.some((c) => c.amount < 0)

  return (
    <Card
      className="tt-area-income"
      title="Income composition"
      actions={
        <Segmented
          label="Show values as"
          value={mode}
          options={[
            { value: 'amount', label: 'Amount' },
            { value: 'percent', label: '% of total' },
          ]}
          onChange={setMode}
        />
      }
    >
      <div className="tt-income">
        <div className="tt-donut">
          <PieChart width={168} height={168}>
            <Pie
              data={slices}
              dataKey="amount"
              nameKey="label"
              innerRadius={58}
              outerRadius={80}
              startAngle={90}
              endAngle={-270}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
              onClick={() => router.push('/income')}
              cursor="pointer"
            >
              {slices.map((c) => (
                <Cell key={c.key} fill={SERIES[c.key]} />
              ))}
            </Pie>
            <Tooltip content={IncomeTooltip} />
          </PieChart>
          <div className="tt-donut-center">
            <strong>{formatMoney(total, { precision: 'compact' })}</strong>
            <span>{excludesJointIncome ? 'Wage income' : 'Total income'}</span>
          </div>
        </div>

        <table className="tt-legend-table">
          <caption className="visually-hidden">Income components</caption>
          <tbody>
            {components.map((c) => (
              <tr key={c.key}>
                <th scope="row">
                  <i className={`tt-swatch${c.amount < 0 ? ' tt-swatch--offset' : ''}`} style={{ '--swatch': SERIES[c.key] } as React.CSSProperties} />
                  {c.label}
                </th>
                <td>{mode === 'amount' ? formatMoney(c.amount) : formatPercent(ratio(c.amount, total))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{mode === 'amount' ? formatMoney(total) : '100.0%'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="tt-panel-footnote">
        {hasOffsets && 'Net losses offset income and are not drawn in the ring. '}
        {excludesJointIncome ? 'Joint investment and other income appear in the Household view.' : 'Before capital-loss limits.'}{' '}
        <ProvenanceBadge status="mixed" />
      </p>
    </Card>
  )
}

function IncomeTooltip({ active, payload }: TooltipContentProps) {
  const c = payload?.[0]?.payload as IncomeComponent | undefined
  if (!active || !c) return null
  return (
    <div className="tt-tooltip">
      <strong>{c.label}</strong>
      <dl>
        <dt>Amount</dt>
        <dd>{formatMoney(c.amount)}</dd>
      </dl>
      <span className="tt-tooltip-hint">Click to open Income & Investments</span>
    </div>
  )
}
