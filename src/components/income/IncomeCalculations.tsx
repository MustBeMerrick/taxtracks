'use client'

import { useState } from 'react'
import { saveCarryover } from '@/app/actions'
import { Card, InfoTip } from '@/components/ui/Card'
import { handleNumericChange } from '@/components/ui/numeric-input'
import type { FilingStatus } from '@/lib/core/filing-status'
import { FILING_STATUS_LABELS } from '@/lib/core/filing-status'
import { calculateIncomeSummary, brokerageAnnuals, payrollAnnuals, type IncomeSummary, type IncomeSummaryInput } from '@/lib/core/income-summary'
import { centsToInput } from '@/lib/core/investments'
import { formatMoney } from '@/lib/core/money'
import type { Carryover, InvestmentSourceSummary, PayrollRecord, Taxpayer } from '@/lib/core/types'
import { formatDollars, parseMoney } from '@/lib/core/withholding/form'
import { useScheduleRefresh } from '@/lib/refresh-context'
import '@/components/income/income.css'
import '@/components/paystubs/paystubs.css'

interface Props {
  year: number
  taxpayers: Pick<Taxpayer, 'id' | 'name'>[]
  investments: InvestmentSourceSummary[]
  paystubs: PayrollRecord[]
  carryovers: Carryover[]
  filingStatus: FilingStatus
}

type Row = { key: keyof IncomeSummary; label: string; tip?: string }

const ROWS: Row[] = [
  { key: 'baseSalary', label: 'Base salary', tip: 'Gross pay from this year’s paystubs, Paid Out and projected.' },
  { key: 'netShortTerm', label: 'Net ST P/L', tip: 'Short-term profit minus short-term loss.' },
  { key: 'netLongTerm', label: 'Net LT P/L', tip: 'Long-term profit minus long-term loss (Fundrise: NAV distributions).' },
  { key: 'grossRealized', label: 'Gross realized income', tip: 'Salary + short- and long-term profits + dividends. Losses are ignored; this is not a tax figure.' },
  { key: 'ordinaryIncome', label: 'Ordinary income', tip: 'Salary + net short-term gain + dividends.' },
  { key: 'ltcgIncome', label: 'LTCG income', tip: 'Net long-term gain after netting against short-term losses and carried-over losses.' },
  { key: 'capitalLossAllowed', label: 'Capital loss allowed', tip: 'A net capital loss offsets ordinary income up to $3,000 ($1,500 if married filing separately).' },
  { key: 'federalStandardDeduction', label: 'Fed standard deduction' },
  { key: 'stateStandardDeduction', label: 'State standard deduction' },
  {
    key: 'federalOrdinaryTaxable',
    label: 'Federal ordinary taxable income',
    tip: 'Ordinary income − HSA − medical/dental/vision/FSA − 401(k) + group-term life − standard deduction − capital loss allowed.',
  },
  {
    key: 'stateTaxable',
    label: 'State taxable income',
    tip: 'Ordinary income + LTCG − medical/dental/vision/FSA − 401(k) + group-term life + employer HSA − standard deduction − capital loss allowed. California taxes HSA contributions.',
  },
  { key: 'capitalLossCarryForward', label: 'Capital loss carry-forward', tip: 'Net capital loss beyond the annual limit, carried into next year.' },
  { key: 'carriedOver', label: 'Capital loss carried over', tip: 'Prior-year capital losses applied this year (household column only).' },
]

export function IncomeCalculations({ year, taxpayers, investments, paystubs, carryovers, filingStatus }: Props) {
  const carry = (kind: Carryover['kind']) => carryovers.find((c) => c.kind === kind)?.amount ?? 0
  const carryoverShort = carry('capital_loss_short')
  const carryoverLong = carry('capital_loss_long')

  const inputFor = (ids: string[], status: FilingStatus, withCarryover: boolean): IncomeSummaryInput => ({
    filingStatus: status,
    ...payrollAnnuals(paystubs.filter((p) => ids.includes(p.taxpayerId))),
    ...brokerageAnnuals(investments.filter((i) => i.owner && ids.includes(i.owner))),
    carryoverShort: withCarryover ? carryoverShort : 0,
    carryoverLong: withCarryover ? carryoverLong : 0,
  })

  const columns = [
    // One person on their own: the single-filer view of their share.
    ...taxpayers.map((t) => ({ key: t.id, label: t.name, summary: calculateIncomeSummary(year, inputFor([t.id], 'single', false)) })),
    ...(taxpayers.length > 1
      ? [{ key: 'household', label: taxpayers.map((t) => t.name).join(' + '), summary: calculateIncomeSummary(year, inputFor(taxpayers.map((t) => t.id), filingStatus, true)) }]
      : []),
  ]

  if (columns.every((c) => c.summary === null)) {
    return (
      <Card title="Calculations">
        <p className="tt-muted">No income rules are on file for {year} yet.</p>
      </Card>
    )
  }

  return (
    <Card title="Calculations">
      <p className="tt-stubs-lead">
        Built from your paystubs and the brokerage boxes on Income & Investments. Person columns are each person filing alone; the last column uses{' '}
        {FILING_STATUS_LABELS[filingStatus]} and the carried-over losses. Taxable income is before tax brackets.
      </p>
      <div className="tt-income-calc-scroll">
        <div className="tt-income-calc-frame">
        <table className="tt-stubs-table tt-income-calc">
          <thead>
            <tr>
              <th scope="col" />
              {columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  {row.label}
                  {row.tip && <InfoTip text={row.tip} />}
                </th>
                {columns.map((c) => {
                  const value = c.summary?.[row.key]
                  return (
                    <td key={c.key} className={`tt-stubs-num ${value !== undefined && value < 0 ? 'tt-stubs-negative' : ''}`}>
                      {value === undefined ? '—' : formatMoney(value)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      <Carryovers key={`${year}-${carryoverShort}-${carryoverLong}`} short={carryoverShort} long={carryoverLong} />
    </Card>
  )
}

function Carryovers({ short, long }: { short: number; long: number }) {
  return (
    <fieldset className="tt-income-carry">
      <legend>Capital loss carried in from last year</legend>
      <CarryBox label="Short-term" kind="capital_loss_short" initial={short} />
      <CarryBox label="Long-term" kind="capital_loss_long" initial={long} />
    </fieldset>
  )
}

function CarryBox({ label, kind, initial }: { label: string; kind: 'capital_loss_short' | 'capital_loss_long'; initial: number }) {
  const scheduleRefresh = useScheduleRefresh()
  const [text, setText] = useState(centsToInput(initial))
  const [error, setError] = useState<string | null>(null)
  const parsed = parseMoney(text)

  async function save(next: string) {
    const value = parseMoney(next)
    if (value === null || value === initial) return
    try {
      const result = await saveCarryover(kind, value)
      setError(result.ok ? null : result.message)
      if (result.ok) scheduleRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <div className="tt-calc-field">
      <label className="tt-field-label">{label}</label>
      <div className={`tt-calc-input tt-income-input ${parsed === null ? 'tt-calc-input--error' : ''}`}>
        <span aria-hidden="true">$</span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          aria-label={`${label} capital loss carried in`}
          value={text}
          onChange={(e) => handleNumericChange(e, setText, 2)}
          onBlur={() => {
            const padded = formatDollars(text)
            setText(padded)
            save(padded)
          }}
        />
      </div>
      {error && <p className="tt-calc-error">{error}</p>}
    </div>
  )
}
