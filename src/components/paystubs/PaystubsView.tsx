'use client'

import { AlertTriangle, CircleAlert, Info, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { deletePaystub, setPaystubPaidOut } from '@/app/actions'
import { Card } from '@/components/ui/Card'
import { PaystubDialog } from '@/components/paystubs/PaystubDialog'
import { formatMoney } from '@/lib/core/money'
import { formatPayDate } from '@/lib/core/pay-dates'
import { paystubRows, payrollWarnings, summarize, type PayrollWarning } from '@/lib/core/payroll'
import type { PayrollRecord, Taxpayer } from '@/lib/core/types'
import { useScheduleRefresh } from '@/lib/refresh-context'
import '@/components/calculators/calculators.css'
import '@/components/paystubs/paystubs.css'
import '@/components/ui/controls.css'

interface Props {
  year: number
  taxpayers: Pick<Taxpayer, 'id' | 'name'>[]
  paystubs: PayrollRecord[]
  /** ISO date on the server, for "pay date has passed" checks. */
  today: string
}

export function PaystubsView({ year, taxpayers, paystubs, today }: Props) {
  const [editing, setEditing] = useState<{ taxpayerId: string; record?: PayrollRecord } | null>(null)

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
        Tick <strong>Paid Out</strong> once a paystub is final. Hover (or focus) a paycheck amount for its year-to-date total, counting
        Paid Out paystubs only; unchecked rows are still projected or up in the air.
      </p>
      {taxpayers.map((person) => (
        <PersonLedger
          key={person.id}
          year={year}
          person={person}
          paystubs={paystubs.filter((p) => p.taxpayerId === person.id)}
          today={today}
          onAdd={() => setEditing({ taxpayerId: person.id })}
          onEdit={(record) => setEditing({ taxpayerId: person.id, record })}
        />
      ))}
      {editing && (
        <PaystubDialog
          key={editing.record?.id ?? `new-${editing.taxpayerId}`}
          year={year}
          taxpayerName={taxpayers.find((t) => t.id === editing.taxpayerId)?.name ?? ''}
          taxpayerId={editing.taxpayerId}
          record={editing.record}
          lastEmployer={paystubs.filter((p) => p.taxpayerId === editing.taxpayerId).at(-1)?.employer ?? ''}
          takenDates={paystubs
            .filter((p) => p.taxpayerId === editing.taxpayerId && p.id !== editing.record?.id)
            .map((p) => p.payDate)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function PersonLedger({
  year,
  person,
  paystubs,
  today,
  onAdd,
  onEdit,
}: {
  year: number
  person: Pick<Taxpayer, 'id' | 'name'>
  paystubs: PayrollRecord[]
  today: string
  onAdd: () => void
  onEdit: (record: PayrollRecord) => void
}) {
  const scheduleRefresh = useScheduleRefresh()
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = paystubRows(paystubs)
  const summary = summarize(paystubs)
  const warnings = payrollWarnings(paystubs, today)
  const warningsByRecord = new Map<string, PayrollWarning[]>()
  for (const w of warnings) if (w.recordId) warningsByRecord.set(w.recordId, [...(warningsByRecord.get(w.recordId) ?? []), w])

  async function run(id: string, action: () => Promise<{ ok: boolean; message: string }>) {
    setBusy((b) => new Set(b).add(id))
    setError(null)
    try {
      const result = await action()
      if (!result.ok) setError(result.message)
      scheduleRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy((b) => {
        const next = new Set(b)
        next.delete(id)
        return next
      })
    }
  }

  return (
    <Card
      title={`${person.name}’s paystubs`}
      actions={
        <button type="button" className="tt-button" onClick={onAdd}>
          <Plus size={16} aria-hidden="true" /> Add paystub
        </button>
      }
    >
      {warnings.length > 0 && (
        <ul className="tt-stubs-warnings" aria-label={`Checks for ${person.name}`}>
          {warnings.map((w) => (
            <li key={w.id} className={`tt-stubs-warning tt-stubs-warning--${w.severity}`}>
              {w.severity === 'error' ? (
                <CircleAlert size={16} aria-label="Error" />
              ) : w.severity === 'warning' ? (
                <AlertTriangle size={16} aria-label="Warning" />
              ) : (
                <Info size={16} aria-label="Note" />
              )}
              <span>{w.message}</span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="tt-notice tt-notice--error">{error}</p>}

      {paystubs.length === 0 ? (
        <p className="tt-muted">No paystubs for {year} yet. Add one with the button above.</p>
      ) : (
        <div className="tt-stubs-scroll" tabIndex={0} role="region" aria-label={`${person.name}'s paystub table`}>
          <table className="tt-stubs-table">
            <thead>
              <tr>
                <th scope="col">Pay date</th>
                <th scope="col" className="tt-stubs-center-col">Paid Out</th>
                <th scope="col">Gross</th>
                <th scope="col">Pre-tax</th>
                <th scope="col">Federal</th>
                <th scope="col">Soc. Sec.</th>
                <th scope="col">Medicare</th>
                <th scope="col">CA tax</th>
                <th scope="col">CA SDI</th>
                <th scope="col">Net pay</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="tt-stubs-total-row">
                <th scope="row" colSpan={2}>
                  YTD
                </th>
                <Money value={summary.paid.gross} />
                <Money value={summary.paid.preTax} />
                <Money value={summary.paid.federal} />
                <Money value={summary.paid.socialSecurity} />
                <Money value={summary.paid.medicare} />
                <Money value={summary.paid.ca} />
                <Money value={summary.paid.sdi} />
                <Money value={summary.paid.net} />
                <td />
              </tr>
              <tr className="tt-stubs-total-row">
                <th scope="row" colSpan={2}>
                  Full year (incl. not paid out)
                </th>
                <Money value={summary.fullYear.gross} />
                <Money value={summary.fullYear.preTax} />
                <Money value={summary.fullYear.federal} />
                <Money value={summary.fullYear.socialSecurity} />
                <Money value={summary.fullYear.medicare} />
                <Money value={summary.fullYear.ca} />
                <Money value={summary.fullYear.sdi} />
                <Money value={summary.fullYear.net} />
                <td />
              </tr>
              {rows.map(({ record, amounts, ytd }) => {
                const paid = record.status === 'actual'
                const flagged = warningsByRecord.get(record.id)?.some((w) => w.severity !== 'info')
                return (
                  <tr key={record.id} className={paid ? '' : 'tt-stubs-pending'} data-flagged={flagged ? 'true' : undefined}>
                    <th scope="row">
                      {formatPayDate(record.payDate)}
                      {record.bonus && <span className="tt-stubs-badge">Bonus</span>}
                    </th>
                    <td className="tt-stubs-center-col">
                      <label className="tt-stubs-paid">
                        <input
                          type="checkbox"
                          checked={paid}
                          disabled={busy.has(record.id)}
                          onChange={(e) => run(record.id, () => setPaystubPaidOut(record.id, e.target.checked))}
                        />
                        <span className="visually-hidden">Paid Out for {formatPayDate(record.payDate)}</span>
                      </label>
                    </td>
                    <Money value={amounts.gross} ytd={paid ? ytd.gross : undefined} />
                    <Money value={amounts.preTax} ytd={paid ? ytd.preTax : undefined} />
                    <Money value={amounts.federal} ytd={paid ? ytd.federal : undefined} />
                    <Money value={amounts.socialSecurity} ytd={paid ? ytd.socialSecurity : undefined} />
                    <Money value={amounts.medicare} ytd={paid ? ytd.medicare : undefined} />
                    <Money value={amounts.ca} ytd={paid ? ytd.ca : undefined} />
                    <Money value={amounts.sdi} ytd={paid ? ytd.sdi : undefined} />
                    <Money value={amounts.net} ytd={paid ? ytd.net : undefined} />
                    <td className="tt-stubs-actions">
                      {confirmingDelete === record.id ? (
                        <span className="tt-confirm-inline">
                          <button
                            type="button"
                            className="tt-button tt-button--danger"
                            disabled={busy.has(record.id)}
                            onClick={() => {
                              setConfirmingDelete(null)
                              run(record.id, () => deletePaystub(record.id))
                            }}
                          >
                            Delete
                          </button>
                          <button type="button" className="tt-button tt-button--plain" onClick={() => setConfirmingDelete(null)}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <>
                          <button type="button" className="tt-icon-button" aria-label={`Edit ${formatPayDate(record.payDate)} paystub`} onClick={() => onEdit(record)}>
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="tt-icon-button"
                            aria-label={`Delete ${formatPayDate(record.payDate)} paystub`}
                            onClick={() => setConfirmingDelete(record.id)}
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function Money({ value, ytd }: { value: number; ytd?: number }) {
  if (ytd === undefined) return <td className="tt-stubs-num">{formatMoney(value)}</td>
  return (
    <td className="tt-stubs-num">
      <span className="tt-stubs-tip" tabIndex={0}>
        {formatMoney(value)}
        <span className="tt-stubs-tip-bubble" role="tooltip">
          YTD {formatMoney(ytd)}
        </span>
      </span>
    </td>
  )
}

