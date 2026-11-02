'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { commitWithholdingSimulation } from '@/app/actions'
import { formatMoney, sum } from '@/lib/core/money'
import { formatPayDate } from '@/lib/core/pay-dates'
import { simulateWithholding, type WithholdingElectionInput } from '@/lib/core/withholding/simulate'
import type { LiabilityEstimate, PayrollRecord, Taxpayer } from '@/lib/core/types'
import { useScheduleRefresh } from '@/lib/refresh-context'
import { Segmented } from '@/components/ui/controls'
import '@/components/calculators/calculators.css'
import '@/components/paystubs/paystubs.css'
import '@/components/ui/controls.css'

export function SimulateWithholdingDialog({
  taxpayers,
  paystubs,
  taxYear,
  election,
  liabilities,
  onClose,
}: {
  taxpayers: Pick<Taxpayer, 'id' | 'name'>[]
  paystubs: PayrollRecord[]
  taxYear: number
  election: WithholdingElectionInput
  liabilities: LiabilityEstimate[]
  onClose: () => void
}) {
  const scheduleRefresh = useScheduleRefresh()
  const dialog = useRef<HTMLDialogElement>(null)
  const [taxpayerId, setTaxpayerId] = useState(taxpayers[0]?.id ?? '')
  const [committing, setCommitting] = useState(false)
  const [committed, setCommitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [])

  const records = useMemo(() => paystubs.filter((p) => p.taxpayerId === taxpayerId), [paystubs, taxpayerId])
  const simulation = useMemo(() => simulateWithholding(records, election, taxYear), [records, election, taxYear])

  const otherTotals = useMemo(() => {
    const other = paystubs.filter((p) => p.taxpayerId !== taxpayerId)
    return { federal: sum(other.map((r) => r.federalWithholding)), ca: sum(other.map((r) => r.caWithholding)) }
  }, [paystubs, taxpayerId])

  const liabilityFederal = sum(liabilities.filter((l) => l.jurisdiction === 'federal').map((l) => l.amount))
  const liabilityCa = sum(liabilities.filter((l) => l.jurisdiction === 'ca').map((l) => l.amount))

  const currentRefund = {
    federal: otherTotals.federal + simulation.current.federal - liabilityFederal,
    ca: otherTotals.ca + simulation.current.ca - liabilityCa,
  }
  const simulatedRefund = {
    federal: otherTotals.federal + simulation.simulated.federal - liabilityFederal,
    ca: otherTotals.ca + simulation.simulated.ca - liabilityCa,
  }

  async function commit() {
    setCommitting(true)
    setServerError(null)
    try {
      const result = await commitWithholdingSimulation(
        simulation.paychecks.map((p) => ({
          id: p.record.id,
          federalWithholding: p.simulated.federal,
          caWithholding: p.simulated.ca,
          socialSecurity: p.simulated.socialSecurity,
          medicare: p.simulated.medicare,
          caSdi: p.simulated.sdi,
          benefits: p.simulated.benefits,
          preTax: p.simulated.preTax,
          gtli: p.simulated.gtli,
          employerHsa: p.simulated.employerHsa,
        })),
      )
      if (!result.ok) {
        setServerError(result.message)
        return
      }
      scheduleRefresh()
      setCommitted(true)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setCommitting(false)
    }
  }

  const person = taxpayers.find((t) => t.id === taxpayerId)

  return (
    <dialog ref={dialog} className="tt-dialog tt-simulate-dialog" aria-labelledby="simulate-dialog-title" onClose={onClose}>
      <header className="tt-dialog-header">
        <h2 id="simulate-dialog-title">Simulate new withholding</h2>
        <p className="tt-muted">
          Applies the Federal, California and Benefits tabs above to {person?.name ?? 'this person'}’s not-yet-Paid-Out paychecks. Gross
          pay per check is unchanged; only the withheld amounts are recalculated, with Social Security and Additional Medicare capped
          correctly across the year.
        </p>
      </header>

      <div className="tt-dialog-body">
        {taxpayers.length > 1 && (
          <Segmented
            label="Person"
            value={taxpayerId}
            options={taxpayers.map((t) => ({ value: t.id, label: t.name }))}
            onChange={setTaxpayerId}
          />
        )}

        {simulation.paychecks.length === 0 ? (
          <p className="tt-muted">Every paycheck this year is already marked Paid Out — nothing left to simulate.</p>
        ) : (
          <div className="tt-stubs-scroll tt-simulate-scroll">
            <table className="tt-stubs-table tt-simulate-table">
              <thead>
                <tr>
                  <th scope="col">Pay date</th>
                  <th scope="col">Federal</th>
                  <th scope="col">CA tax</th>
                  <th scope="col">Soc. Sec.</th>
                  <th scope="col">Medicare</th>
                  <th scope="col">CA SDI</th>
                  <th scope="col">Net pay</th>
                </tr>
              </thead>
              <tbody>
                {simulation.paychecks.map(({ record, current, simulated }) => (
                  <tr key={record.id}>
                    <th scope="row">{formatPayDate(record.payDate)}</th>
                    <Delta current={current.federal} next={simulated.federal} />
                    <Delta current={current.ca} next={simulated.ca} />
                    <Delta current={current.socialSecurity} next={simulated.socialSecurity} />
                    <Delta current={current.medicare} next={simulated.medicare} />
                    <Delta current={current.sdi} next={simulated.sdi} />
                    <Delta current={current.net} next={simulated.net} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="tt-simulate-refund">
          <p className="tt-field-label">Projected household refund / amount due (estimate)</p>
          <p className="tt-muted">
            Real withholding totals against the current placeholder liability estimate, not a real tax calculation yet.
          </p>
          <RefundLine label="Federal" current={currentRefund.federal} next={simulatedRefund.federal} />
          <RefundLine label="California" current={currentRefund.ca} next={simulatedRefund.ca} />
        </div>

        {serverError && <p className="tt-notice tt-notice--error">{serverError}</p>}
        {committed && <p className="tt-notice">Committed — the not-yet-Paid-Out paychecks now carry these withheld amounts.</p>}
      </div>

      <footer className="tt-dialog-footer">
        <button type="button" className="tt-button tt-button--plain" onClick={() => dialog.current?.close()}>
          {committed ? 'Close' : 'Cancel'}
        </button>
        {!committed && (
          <button type="button" className="tt-button" disabled={committing || simulation.paychecks.length === 0} onClick={commit}>
            {committing ? 'Applying…' : `Apply as new election (${simulation.paychecks.length} paycheck${simulation.paychecks.length === 1 ? '' : 's'})`}
          </button>
        )}
      </footer>
    </dialog>
  )
}

function Delta({ current, next }: { current: number; next: number }) {
  const changed = current !== next
  return (
    <td className="tt-stubs-num tt-simulate-delta">
      {changed ? (
        <>
          <span className="tt-muted">{formatMoney(current)}</span> → <strong>{formatMoney(next)}</strong>
        </>
      ) : (
        formatMoney(current)
      )}
    </td>
  )
}

function RefundLine({ label, current, next }: { label: string; current: number; next: number }) {
  const changed = current !== next
  return (
    <p className="tt-stubs-check">
      <strong>{label}</strong>: {describeRefund(current)}
      {changed && (
        <>
          {' '}
          → <strong>{describeRefund(next)}</strong>
        </>
      )}
    </p>
  )
}

function describeRefund(amount: number): string {
  return amount >= 0 ? `${formatMoney(amount)} refund` : `${formatMoney(-amount)} owed`
}
