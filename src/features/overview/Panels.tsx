import { CircleAlert, CircleCheck, CircleDashed } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Card, ProvenanceBadge } from '../../components/ui/Card'
import { Segmented } from '../../components/ui/controls'
import type { ActivityItem } from '../../domain/types'
import { formatMoney, formatPercent, type Cents } from '../../lib/money'
import type { OverviewModel, PayrollTotals } from './model'

const JURISDICTION_LABELS = { federal: 'Federal', ca: 'California' }

function Signed({ value }: { value: Cents }) {
  return <span className={value < 0 ? 'tt-signed-negative' : undefined}>{formatMoney(value)}</span>
}

export function FederalVsState({ model }: { model: OverviewModel }) {
  const [measure, setMeasure] = useState<'liability' | 'paid'>('liability')
  const values = measure === 'liability' ? model.liability : model.payments
  const max = Math.max(values.federal, values.ca, 1)

  return (
    <Card
      className="tt-area-fedstate"
      title="Federal vs. California"
      actions={
        <Segmented
          label="Measure"
          value={measure}
          options={[
            { value: 'liability', label: 'Liability' },
            { value: 'paid', label: 'Paid (proj.)' },
          ]}
          onChange={setMeasure}
        />
      }
    >
      <ul className="tt-hbars">
        {(['federal', 'ca'] as const).map((j) => (
          <li key={j}>
            <span className="tt-hbar-label">{JURISDICTION_LABELS[j]}</span>
            <span className="tt-hbar-track">
              <span className="tt-hbar-fill" style={{ width: `${(values[j] / max) * 100}%` }} />
            </span>
            <span className="tt-hbar-value">{formatMoney(values[j], { precision: 'whole' })}</span>
          </li>
        ))}
      </ul>
      <p className="tt-panel-footnote">
        {measure === 'liability' ? 'Projected income-tax liability' : 'Actual plus projected withholding'} ·{' '}
        <Link className="tt-link" to="/tax-engine">
          Trace in Tax Engine
        </Link>
      </p>
    </Card>
  )
}

export function InvestmentTable({ model }: { model: OverviewModel }) {
  const { rows, totals } = model.investments
  return (
    <Card className="tt-area-invest" title={model.scope === 'household' ? 'Investment P/L' : 'Investment P/L (joint)'} actions={<Link className="tt-link" to="/income">Details</Link>}>
      <div className="tt-table-scroll">
        <table className="tt-table tt-table--compact tt-table--sticky">
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">ST P/L</th>
              <th scope="col">LT P/L</th>
              <th scope="col">Div/Int</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">
                  <Link to={`/income?source=${r.id}`}>{r.name}</Link>
                </th>
                <td><Signed value={r.shortTerm} /></td>
                <td><Signed value={r.longTerm} /></td>
                <td><Signed value={r.dividendsInterest} /></td>
                <td><Signed value={r.total} /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td><Signed value={totals.shortTerm} /></td>
              <td><Signed value={totals.longTerm} /></td>
              <td><Signed value={totals.dividendsInterest} /></td>
              <td><Signed value={totals.total} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

export function WithholdingProgress({ model }: { model: OverviewModel }) {
  return (
    <Card className="tt-area-withholding" title="Withholding progress">
      <ul className="tt-meters">
        {model.withholding.map((w) => {
          const scale = Math.max(w.liability, w.actual + w.projectedRemaining, 1)
          const over = w.difference >= 0
          return (
            <li key={w.jurisdiction}>
              <div className="tt-meter-head">
                <span className="tt-meter-name">{JURISDICTION_LABELS[w.jurisdiction]}</span>
                <span className={`tt-meter-delta ${over ? '' : 'tt-signed-negative'}`}>
                  {formatMoney(w.difference, { sign: 'auto' })} {over ? 'over' : 'short'}
                </span>
              </div>
              <div
                className="tt-meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(w.coverage * 100)}
                aria-label={`${JURISDICTION_LABELS[w.jurisdiction]} projected coverage of liability`}
              >
                <span className="tt-meter-actual" style={{ width: `${(w.actual / scale) * 100}%` }} />
                <span className="tt-meter-projected" style={{ width: `${(w.projectedRemaining / scale) * 100}%` }} />
                <span className="tt-meter-target" style={{ left: `${(w.liability / scale) * 100}%` }} />
              </div>
              <div className="tt-meter-foot">
                <strong>{formatPercent(w.coverage)}</strong>
                <span>
                  {formatMoney(w.actual, { precision: 'whole' })} actual + {formatMoney(w.projectedRemaining, { precision: 'whole' })} projected
                  of {formatMoney(w.liability, { precision: 'whole' })}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="tt-panel-footnote">
        <i className="tt-key tt-key--actual" /> Actual <i className="tt-key tt-key--projected" /> Projected{' '}
        <i className="tt-key tt-key--target-v" /> Liability
      </p>
    </Card>
  )
}

const PAYROLL_COLUMNS: { key: keyof PayrollTotals; label: string }[] = [
  { key: 'gross', label: 'Gross' },
  { key: 'federal', label: 'Federal' },
  { key: 'ca', label: 'State (CA)' },
  { key: 'socialSecurity', label: 'Social Sec' },
  { key: 'medicare', label: 'Medicare' },
  { key: 'caSdi', label: 'CA SDI' },
  { key: 'preTax', label: 'Pre-tax deds' },
  { key: 'takeHome', label: 'Take-home' },
]

export function PaycheckSummary({ model }: { model: OverviewModel }) {
  const [period, setPeriod] = useState<'ytd' | 'fullYear'>('ytd')
  const { rows, total } = model.paychecks
  const all = total ? [...rows, total] : rows

  return (
    <Card
      className="tt-area-paychecks"
      title="Paycheck summary"
      actions={
        <>
          <Segmented
            label="Period"
            value={period}
            options={[
              { value: 'ytd', label: 'YTD actual' },
              { value: 'fullYear', label: 'Projected full year' },
            ]}
            onChange={setPeriod}
          />
          <Link className="tt-link" to="/payroll">
            Ledger
          </Link>
        </>
      }
    >
      <div className="tt-table-scroll">
        <table className="tt-table tt-table--sticky">
          <thead>
            <tr>
              <th scope="col">Worker</th>
              {PAYROLL_COLUMNS.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((r) => (
              <tr key={r.taxpayerId} className={r.taxpayerId === 'total' ? 'tt-row-total' : undefined}>
                <th scope="row">{r.name}</th>
                {PAYROLL_COLUMNS.map((c) => (
                  <td key={c.key}>{formatMoney(r[period][c.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tt-panel-footnote">
        <ProvenanceBadge status={period === 'ytd' ? 'actual' : 'mixed'} />{' '}
        {period === 'ytd' ? 'Recorded paychecks only.' : 'Recorded paychecks plus scheduled projections.'} Payroll taxes are shown for cash flow and are not
        part of income-tax liability.
      </p>
    </Card>
  )
}

const ACTIVITY_ICONS = { done: CircleCheck, upcoming: CircleDashed, warning: CircleAlert }
const activityDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function RecentActivity({ items, asOf }: { items: ActivityItem[]; asOf: string }) {
  const year = asOf.slice(0, 4)
  return (
    <Card className="tt-area-activity" title="Recent activity & next steps" actions={<Link className="tt-link" to="/settings">View all</Link>}>
      <ul className="tt-activity">
        {items.map((a) => {
          const Icon = ACTIVITY_ICONS[a.kind]
          const d = new Date(`${a.date}T00:00:00Z`)
          return (
            <li key={a.id} className={`tt-activity--${a.kind}`}>
              <Icon size={18} aria-label={a.kind === 'done' ? 'Done' : a.kind === 'warning' ? 'Needs attention' : 'Upcoming'} />
              <time dateTime={a.date}>
                {activityDate.format(d)}
                {a.date.slice(0, 4) !== year && `, ${a.date.slice(0, 4)}`}
              </time>
              <span>{a.label}</span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

