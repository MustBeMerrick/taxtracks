'use client'

import { useRef, useState } from 'react'
import { saveInvestmentEntry } from '@/app/actions'
import { Card } from '@/components/ui/Card'
import { handleNumericChange } from '@/components/ui/numeric-input'
import { BROKERAGES, centsToInput, findEntry, profitLoss, type Brokerage } from '@/lib/core/investments'
import { formatMoney } from '@/lib/core/money'
import type { InvestmentSourceSummary, Taxpayer } from '@/lib/core/types'
import { formatDollars, parseMoney } from '@/lib/core/withholding/form'
import { useScheduleRefresh } from '@/lib/refresh-context'
import '@/components/calculators/calculators.css'
import '@/components/income/income.css'
import '@/components/paystubs/paystubs.css'
import '@/components/ui/controls.css'

interface Props {
  year: number
  taxpayers: Pick<Taxpayer, 'id' | 'name'>[]
  investments: InvestmentSourceSummary[]
}

const sumOf = (rows: InvestmentSourceSummary[], pick: (r: InvestmentSourceSummary) => number) => rows.reduce((t, r) => t + pick(r), 0)

export function IncomeView({ year, taxpayers, investments }: Props) {
  if (taxpayers.length === 0) {
    return (
      <Card title="No people yet">
        <p className="tt-muted">Restore a backup or reset to sample data in Settings to set up the household.</p>
      </Card>
    )
  }
  return (
    <div className="tt-stubs">
      <p className="tt-stubs-lead">
        Type each brokerage’s dividends and short- and long-term gains or losses for {year}. Rough estimates are fine; tick{' '}
        <strong>1099 final</strong> once the real numbers are in. Entries save as you leave a box and feed the Overview.
      </p>
      {taxpayers.map((person) => (
        <PersonBrokerages key={`${year}-${person.id}`} person={person} records={investments.filter((i) => i.owner === person.id)} />
      ))}
      <Card title="Household total">
        <TotalsLine rows={investments.filter((i) => i.owner && taxpayers.some((t) => t.id === i.owner))} />
      </Card>
    </div>
  )
}

function TotalsLine({ rows }: { rows: InvestmentSourceSummary[] }) {
  const items = [
    ['Dividends', sumOf(rows, (r) => r.dividendsInterest)],
    ['Short-term P/L', sumOf(rows, (r) => r.shortTerm)],
    ['Long-term P/L', sumOf(rows, (r) => r.longTerm)],
  ] as const
  return (
    <dl className="tt-stubs-stats">
      {items.map(([label, value]) => (
        <div key={label} className="tt-stubs-stat">
          <dt>{label}</dt>
          <dd className={value < 0 ? 'tt-stubs-negative' : ''}>{formatMoney(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function PersonBrokerages({ person, records }: { person: Pick<Taxpayer, 'id' | 'name'>; records: InvestmentSourceSummary[] }) {
  return (
    <Card title={`${person.name}’s brokerages`}>
      <div className="tt-stubs-scroll">
        <table className="tt-stubs-table tt-income-table">
          <thead>
            <tr>
              <th scope="col">Brokerage</th>
              <th scope="col">Dividends</th>
              <th scope="col">Short-term profit</th>
              <th scope="col">Short-term loss</th>
              <th scope="col">Short-term P/L</th>
              <th scope="col">Long-term profit</th>
              <th scope="col">Long-term loss</th>
              <th scope="col">Long-term P/L</th>
              <th scope="col" className="tt-stubs-center-col">
                1099 final
              </th>
            </tr>
          </thead>
          <tbody>
            {BROKERAGES.map((b) => (
              <BrokerageRow key={b.key} personId={person.id} brokerage={b} record={findEntry(records, person.id, b.key)} />
            ))}
          </tbody>
          <tfoot>
            <tr className="tt-stubs-total-row">
              <th scope="row">Total</th>
              <Num value={sumOf(records, (r) => r.dividendsInterest)} />
              <Num value={sumOf(records, (r) => profitLoss(r).shortTerm.profit)} />
              <Num value={sumOf(records, (r) => profitLoss(r).shortTerm.loss)} />
              <Num value={sumOf(records, (r) => r.shortTerm)} signed />
              <Num value={sumOf(records, (r) => profitLoss(r).longTerm.profit)} />
              <Num value={sumOf(records, (r) => profitLoss(r).longTerm.loss)} />
              <Num value={sumOf(records, (r) => r.longTerm)} signed />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}

function Num({ value, signed = false }: { value: number; signed?: boolean }) {
  return <td className={`tt-stubs-num ${signed && value < 0 ? 'tt-stubs-negative' : ''}`}>{formatMoney(value)}</td>
}

interface RowState {
  dividends: string
  stProfit: string
  stLoss: string
  ltProfit: string
  ltLoss: string
  final: boolean
}

function BrokerageRow({ personId, brokerage, record }: { personId: string; brokerage: Brokerage; record?: InvestmentSourceSummary }) {
  const scheduleRefresh = useScheduleRefresh()
  const [row, setRow] = useState<RowState>(() => {
    const pl = profitLoss(record)
    return {
      dividends: centsToInput(record?.dividendsInterest ?? 0),
      stProfit: centsToInput(pl.shortTerm.profit),
      stLoss: centsToInput(pl.shortTerm.loss),
      ltProfit: centsToInput(pl.longTerm.profit),
      ltLoss: centsToInput(pl.longTerm.loss),
      final: record?.status === 'actual',
    }
  })
  const [error, setError] = useState<string | null>(null)
  // Saves for one row go out one at a time so a quick Tab-Tab-Tab cannot land out of order.
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const lastSaved = useRef(JSON.stringify(row))

  const parsed = {
    dividends: parseMoney(row.dividends),
    stProfit: parseMoney(row.stProfit),
    stLoss: parseMoney(row.stLoss),
    ltProfit: parseMoney(row.ltProfit),
    ltLoss: parseMoney(row.ltLoss),
  }
  const values = Object.values(parsed)
  const invalid = values.some((v) => v === null)

  function save(next: RowState) {
    const snapshot = JSON.stringify(next)
    if (snapshot === lastSaved.current) return
    const dividends = parseMoney(next.dividends)
    const shortTermProfit = parseMoney(next.stProfit)
    const shortTermLoss = parseMoney(next.stLoss)
    const longTermProfit = parseMoney(next.ltProfit)
    const longTermLoss = parseMoney(next.ltLoss)
    if (dividends === null || shortTermProfit === null || shortTermLoss === null || longTermProfit === null || longTermLoss === null) return
    lastSaved.current = snapshot
    queue.current = queue.current.then(async () => {
      try {
        const result = await saveInvestmentEntry({ taxpayerId: personId, brokerage: brokerage.key, dividends, shortTermProfit, shortTermLoss, longTermProfit, longTermLoss, final: next.final })
        setError(result.ok ? null : result.message)
        if (result.ok) scheduleRefresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const field = (key: 'dividends' | 'stProfit' | 'stLoss' | 'ltProfit' | 'ltLoss', label: string) => {
    const bad = parsed[key] === null
    return (
      <div className={`tt-calc-input tt-income-input ${bad ? 'tt-calc-input--error' : ''}`}>
        <span aria-hidden="true">$</span>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          aria-label={`${brokerage.name} ${label}`}
          aria-invalid={bad ? true : undefined}
          value={row[key]}
          onChange={(e) => handleNumericChange(e, (v) => setRow((r) => ({ ...r, [key]: v })), 2)}
          onBlur={() => {
            const next = { ...row, [key]: formatDollars(row[key]) }
            setRow(next)
            save(next)
          }}
        />
      </div>
    )
  }

  // Each term's P/L is its profit minus its loss.
  const shortNet = invalid ? null : (parsed.stProfit ?? 0) - (parsed.stLoss ?? 0)
  const longNet = invalid ? null : (parsed.ltProfit ?? 0) - (parsed.ltLoss ?? 0)
  const fundrise = brokerage.navDistributions

  return (
    <tr className={row.final ? '' : 'tt-stubs-pending'}>
      <th scope="row">
        {brokerage.name}
        {fundrise && <span className="tt-income-hint">Long-term profit box = NAV distributions</span>}
        {error && <span className="tt-income-error">{error}</span>}
      </th>
      <td>{field('dividends', 'dividends')}</td>
      <td>{fundrise ? <span className="tt-muted">n/a</span> : field('stProfit', 'short-term profit')}</td>
      <td>{fundrise ? <span className="tt-muted">n/a</span> : field('stLoss', 'short-term loss')}</td>
      {shortNet === null ? <td className="tt-stubs-num">—</td> : <Num value={shortNet} signed />}
      <td>{field('ltProfit', fundrise ? 'NAV distributions' : 'long-term profit')}</td>
      <td>{fundrise ? <span className="tt-muted">n/a</span> : field('ltLoss', 'long-term loss')}</td>
      {longNet === null ? <td className="tt-stubs-num">—</td> : <Num value={longNet} signed />}
      <td className="tt-stubs-center-col">
        <label className="tt-stubs-paid">
          <input
            type="checkbox"
            checked={row.final}
            onChange={(e) => {
              const next = { ...row, final: e.target.checked }
              setRow(next)
              save(next)
            }}
          />
          <span className="visually-hidden">{brokerage.name} 1099 final</span>
        </label>
      </td>
    </tr>
  )
}
