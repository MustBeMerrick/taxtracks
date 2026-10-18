'use client'

import { useState } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/controls'
import { formatMoney } from '@/lib/core/money'
import type { MonthPoint, OverviewModel } from '@/lib/core/overview'

const dollars = (c: number) => c / 100

export function PaymentsChart({ model }: { model: OverviewModel }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const { monthly, liability, payments, refund, lastActualMonth } = model
  const firstProjected = monthly.find((m) => m.status === 'projected')?.month
  const data = monthly.map((m) => ({ ...m, value: dollars(m.cumulative) }))
  // Headroom above the liability line keeps its label and the "Projected" label apart.
  const yMax = Math.ceil((Math.max(dollars(liability.total), dollars(payments.total)) * 1.15) / 20_000) * 20_000

  return (
    <Card
      className="tt-area-chart"
      title="Tax liability vs. payments"
      actions={
        <Segmented
          label="Display"
          value={view}
          options={[
            { value: 'chart', label: 'Chart' },
            { value: 'table', label: 'Table' },
          ]}
          onChange={setView}
        />
      }
    >
      <div className="tt-chart-legend" aria-hidden={view === 'table'}>
        <span>
          <i className="tt-key tt-key--actual" /> Paid (actual)
        </span>
        <span>
          <i className="tt-key tt-key--projected" /> Paid (projected)
        </span>
        <span>
          <i className="tt-key tt-key--target" /> Projected liability
        </span>
      </div>

      <div className="tt-chart-body">
        {view === 'chart' ? (
          <div className="tt-chart-plot" role="img" aria-label={chartSummary(model)}>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.6} />
                {firstProjected && (
                  <ReferenceArea
                    x1={firstProjected}
                    x2="Dec"
                    fill="var(--surface-inset)"
                    fillOpacity={0.6}
                    label={{ value: 'Projected', position: 'insideTopRight', fill: 'var(--text-muted)', fontSize: 11 }}
                  />
                )}
                <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: 'var(--border)' }} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <YAxis
                  domain={[0, yMax]}
                  tickCount={5}
                  width={52}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                  tickFormatter={(v: number) => formatMoney(v * 100, { precision: 'compact' })}
                />
                <ReferenceLine
                  y={dollars(liability.total)}
                  stroke="var(--chart-secondary)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  label={{
                    value: `Liability ${formatMoney(liability.total, { precision: 'compact' })}`,
                    position: 'insideTopLeft',
                    fill: 'var(--text-secondary)',
                    fontSize: 12,
                  }}
                />
                <Tooltip content={PaymentsTooltip} cursor={{ fill: 'var(--surface-raised)', fillOpacity: 0.6 }} />
                <Bar dataKey="value" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {data.map((m) => (
                    <Cell
                      key={m.month}
                      fill={m.status === 'actual' ? 'var(--accent)' : 'var(--accent-soft)'}
                      stroke={m.status === 'actual' ? 'none' : 'var(--accent)'}
                      strokeDasharray={m.status === 'actual' ? undefined : '4 3'}
                      strokeWidth={m.status === 'actual' ? 0 : 1.5}
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
            {lastActualMonth && <p className="tt-chart-caption">Actual withholding through {lastActualMonth}; later months projected from scheduled paychecks.</p>}
          </div>
        ) : (
          <PaymentsTable monthly={monthly} />
        )}

        <aside className="tt-forecast" aria-label="Year-end forecast">
          <h3>Year-end forecast</h3>
          <dl>
            <dt>Tax liability</dt>
            <dd>{formatMoney(liability.total)}</dd>
            <dt>Total paid</dt>
            <dd>{formatMoney(payments.total)}</dd>
            <dt>{refund.total >= 0 ? 'Projected refund' : 'Projected due'}</dt>
            <dd className={refund.total >= 0 ? 'tt-signed-positive' : 'tt-signed-negative'}>{formatMoney(refund.total, { sign: 'auto' })}</dd>
          </dl>
        </aside>
      </div>
    </Card>
  )
}

function chartSummary({ payments, liability, lastActualMonth }: OverviewModel) {
  return `Cumulative withholding by month, actual through ${lastActualMonth ?? 'none'}, reaching ${formatMoney(payments.total)} by December against projected liability of ${formatMoney(liability.total)}. Switch to Table for values.`
}

function PaymentsTooltip({ active, payload }: TooltipContentProps) {
  const point = payload?.[0]?.payload as MonthPoint | undefined
  if (!active || !point) return null
  return (
    <div className="tt-tooltip">
      <strong>
        {point.month} · {point.status === 'actual' ? 'Actual' : 'Projected'}
      </strong>
      <dl>
        <dt>Paid this month</dt>
        <dd>{formatMoney(point.paid)}</dd>
        <dt>Federal</dt>
        <dd>{formatMoney(point.federal)}</dd>
        <dt>California</dt>
        <dd>{formatMoney(point.ca)}</dd>
        <dt>Cumulative</dt>
        <dd>{formatMoney(point.cumulative)}</dd>
      </dl>
    </div>
  )
}

function PaymentsTable({ monthly }: { monthly: MonthPoint[] }) {
  return (
    <div className="tt-table-scroll tt-chart-plot">
      <table className="tt-table">
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Status</th>
            <th scope="col">Federal</th>
            <th scope="col">California</th>
            <th scope="col">Paid</th>
            <th scope="col">Cumulative</th>
          </tr>
        </thead>
        <tbody>
          {monthly.map((m) => (
            <tr key={m.month}>
              <th scope="row">{m.month}</th>
              <td className="tt-text">{m.status === 'actual' ? 'Actual' : 'Projected'}</td>
              <td>{formatMoney(m.federal)}</td>
              <td>{formatMoney(m.ca)}</td>
              <td>{formatMoney(m.paid)}</td>
              <td>{formatMoney(m.cumulative)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
