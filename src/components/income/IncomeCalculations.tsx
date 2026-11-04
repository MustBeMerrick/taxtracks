'use client'

import { useState } from 'react'
import { saveCarryover, saveDeduction } from '@/app/actions'
import { Card, InfoTip } from '@/components/ui/Card'
import { handleNumericChange } from '@/components/ui/numeric-input'
import type { FilingStatus } from '@/lib/core/filing-status'
import { FILING_STATUS_LABELS } from '@/lib/core/filing-status'
import {
  calculateIncomeSummary,
  brokerageAnnuals,
  itemizedAnnuals,
  payrollAnnuals,
  type DeductionCategory,
  type IncomeSummary,
  type IncomeSummaryInput,
} from '@/lib/core/income-summary'
import { centsToInput } from '@/lib/core/investments'
import { formatMoney } from '@/lib/core/money'
import type { Carryover, Deduction, InvestmentSourceSummary, PayrollRecord, TaxPayment, Taxpayer } from '@/lib/core/types'
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
  deductions: Deduction[]
  taxPayments: TaxPayment[]
  filingStatus: FilingStatus
}

type MoneyKey = { [K in keyof IncomeSummary]: IncomeSummary[K] extends number ? K : never }[keyof IncomeSummary]
type Row = { key: MoneyKey; label: string; tip?: string }

const ROWS: Row[] = [
  { key: 'baseSalary', label: 'Base salary', tip: 'Gross pay from this year’s paystubs, Paid Out and projected.' },
  { key: 'netShortTerm', label: 'Net ST P/L', tip: 'Short-term profit minus short-term loss.' },
  { key: 'netLongTerm', label: 'Net LT P/L', tip: 'Long-term profit minus long-term loss (Fundrise: NAV distributions).' },
  { key: 'grossRealized', label: 'Gross realized income', tip: 'Salary + short- and long-term profits + dividends. Losses are ignored; this is not a tax figure.' },
  { key: 'ordinaryIncome', label: 'Ordinary income', tip: 'Salary + net short-term gain + dividends.' },
  { key: 'ltcgIncome', label: 'LTCG income', tip: 'Net long-term gain after netting against short-term losses and carried-over losses.' },
  { key: 'capitalLossAllowed', label: 'Capital loss allowed', tip: 'A net capital loss offsets ordinary income up to $3,000 ($1,500 if married filing separately).' },
  {
    key: 'federalAgi',
    label: 'Federal AGI',
    tip: 'Ordinary income + LTCG − HSA − medical/dental/vision/FSA − 401(k) + group-term life − capital loss allowed.',
  },
  { key: 'federalStandardDeduction', label: 'Fed standard deduction' },
  {
    key: 'federalSaltAllowed',
    label: 'Fed state & local taxes',
    tip: 'California income tax withheld + SDI + California payments made this year + property tax, capped at $40,400 ($20,200 separate); the cap shrinks by 30% of AGI over $505,000, to no less than $10,000.',
  },
  {
    key: 'federalItemizedDeduction',
    label: 'Fed itemized deductions',
    tip: 'State & local taxes + mortgage interest + charity above 0.5% of AGI.',
  },
  {
    key: 'federalDeduction',
    label: 'Fed deduction used',
    tip: 'The larger of itemized and standard. Taking the standard deduction adds up to $1,000 of cash charity ($2,000 joint).',
  },
  {
    key: 'federalOrdinaryTaxable',
    label: 'Federal ordinary taxable income',
    tip: 'Federal AGI − LTCG − deduction used.',
  },
  {
    key: 'stateAgi',
    label: 'State AGI',
    tip: 'Ordinary income + LTCG − medical/dental/vision/FSA − 401(k) + group-term life + employer HSA − capital loss allowed. California taxes HSA contributions.',
  },
  { key: 'stateStandardDeduction', label: 'State standard deduction' },
  {
    key: 'stateItemizedDeduction',
    label: 'State itemized deductions',
    tip: 'Property tax + mortgage interest + charity. California doesn’t deduct its own income tax or SDI.',
  },
  { key: 'stateDeduction', label: 'State deduction used', tip: 'The larger of itemized and standard.' },
  {
    key: 'stateTaxable',
    label: 'State taxable income',
    tip: 'State AGI − deduction used.',
  },
  { key: 'capitalLossCarryForward', label: 'Capital loss carry-forward', tip: 'Net capital loss beyond the annual limit, carried into next year.' },
  { key: 'carriedOver', label: 'Capital loss carried over', tip: 'Prior-year capital losses applied this year (household column only).' },
]

export function IncomeCalculations({ year, taxpayers, investments, paystubs, carryovers, deductions, taxPayments, filingStatus }: Props) {
  const carry = (kind: Carryover['kind']) => carryovers.find((c) => c.kind === kind)?.amount ?? 0
  const carryoverShort = carry('capital_loss_short')
  const carryoverLong = carry('capital_loss_long')

  const itemized = itemizedAnnuals(year, deductions, taxPayments)
  const deductionAmount = (category: DeductionCategory) => deductions.find((d) => d.category === category)?.amount ?? 0

  // Carryovers and household deductions/payments only go in the household column; a person's column itemizes their own paycheck taxes.
  const inputFor = (ids: string[], status: FilingStatus, household: boolean): IncomeSummaryInput => ({
    filingStatus: status,
    ...payrollAnnuals(paystubs.filter((p) => ids.includes(p.taxpayerId))),
    ...brokerageAnnuals(investments.filter((i) => i.owner && ids.includes(i.owner))),
    ...(household ? itemized : {}),
    carryoverShort: household ? carryoverShort : 0,
    carryoverLong: household ? carryoverLong : 0,
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
        {FILING_STATUS_LABELS[filingStatus]}, the carried-over losses and the household deductions below. Taxable income is before tax brackets.
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
      <fieldset className="tt-income-carry">
        <legend>Itemized deductions this year (household)</legend>
        {DEDUCTION_FIELDS.map(([category, label]) => (
          <MoneyBox
            key={`${year}-${category}-${deductionAmount(category)}`}
            label={label}
            ariaLabel={`${label} for ${year}`}
            initial={deductionAmount(category)}
            onSave={(value) => saveDeduction(category, value)}
          />
        ))}
      </fieldset>
    </Card>
  )
}

const DEDUCTION_FIELDS: [DeductionCategory, string][] = [
  ['property_tax', 'Property tax'],
  ['mortgage_interest', 'Mortgage interest'],
  ['charity_cash', 'Charity (cash)'],
  ['charity_noncash', 'Charity (non-cash)'],
]

function Carryovers({ short, long }: { short: number; long: number }) {
  return (
    <fieldset className="tt-income-carry">
      <legend>Capital loss carried in from last year</legend>
      <MoneyBox label="Short-term" ariaLabel="Short-term capital loss carried in" initial={short} onSave={(v) => saveCarryover('capital_loss_short', v)} />
      <MoneyBox label="Long-term" ariaLabel="Long-term capital loss carried in" initial={long} onSave={(v) => saveCarryover('capital_loss_long', v)} />
    </fieldset>
  )
}

function MoneyBox({
  label,
  ariaLabel,
  initial,
  onSave,
}: {
  label: string
  ariaLabel: string
  initial: number
  onSave: (value: number) => Promise<{ ok: boolean; message: string }>
}) {
  const scheduleRefresh = useScheduleRefresh()
  const [text, setText] = useState(centsToInput(initial))
  const [error, setError] = useState<string | null>(null)
  const parsed = parseMoney(text)

  async function save(next: string) {
    const value = parseMoney(next)
    if (value === null || value === initial) return
    try {
      const result = await onSave(value)
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
          aria-label={ariaLabel}
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
