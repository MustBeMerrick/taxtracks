'use client'

import { Card, InfoTip } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/controls'
import { ALLOCATION_METHODS, type AllocationMethod } from '@/lib/core/liability-allocation'
import { formatMoney, type Cents } from '@/lib/core/money'
import type { ByJurisdiction, OverviewModel } from '@/lib/core/overview'

const SHORT_LABELS: Record<AllocationMethod, string> = { income_proportional: 'By income', source_attributed: 'By source' }

const TIP =
  'An internal split of one jointly filed return, not a separate liability the IRS or FTB would assess. The household total is the same either way.'

function Row({ label, values, tip, strong, signed }: { label: string; values: ByJurisdiction; tip?: string; strong?: boolean; signed?: boolean }) {
  const cell = (v: Cents) => <td className={signed && v < 0 ? 'tt-signed-negative' : undefined}>{formatMoney(v, signed ? { sign: 'auto' } : undefined)}</td>
  return (
    <tr className={strong ? 'tt-allocation-strong' : undefined}>
      <th scope="row">
        {label}
        {tip && <InfoTip text={tip} />}
      </th>
      {cell(values.federal)}
      {cell(values.ca)}
      {cell(values.total)}
    </tr>
  )
}

/** A person's share of the joint liability, how it was split, and what that leaves them owing or refunded. */
export function AllocationCard({
  model,
  name,
  method,
  onMethodChange,
  canAttribute,
}: {
  model: OverviewModel
  name: string
  method: AllocationMethod
  onMethodChange: (method: AllocationMethod) => void
  /** False when the engine can't re-run scenarios (no tables for the year): only income proportional applies. */
  canAttribute: boolean
}) {
  const a = model.allocation
  if (!a) return null
  const description = ALLOCATION_METHODS.find((m) => m.value === a.method)?.description
  const source = a.method === 'source_attributed'
  const hasJointPayments = a.jointPayments.total !== 0

  return (
    <Card
      className="tt-allocation"
      title={`${name}’s share of the joint return`}
      actions={
        canAttribute ? (
          <Segmented
            label="Allocation method"
            value={method}
            options={ALLOCATION_METHODS.map((m) => ({ value: m.value, label: SHORT_LABELS[m.value] }))}
            onChange={onMethodChange}
          />
        ) : undefined
      }
    >
      <p className="tt-allocation-lead">
        {description} <InfoTip text={TIP} />
      </p>
      {a.note && <p className="tt-muted">{a.note}</p>}
      <div className="tt-table-scroll">
        <table className="tt-table tt-table--compact">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">Federal</th>
              <th scope="col">California</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {source && (
              <>
                <Row label="Baseline tax (wage share)" values={a.baseline} tip="The joint tax with no one’s investments, split by each person’s taxable wages." />
                <Row
                  label="Investment-related tax"
                  values={a.investment}
                  tip="How much the joint tax goes up because of this person’s own brokerage results (and any deductions they own). Negative when losses lower it."
                />
              </>
            )}
            <Row label="Allocated liability" values={model.liability} strong />
            <Row
              label={hasJointPayments ? 'Withholding & payments' : 'Withholding'}
              values={model.payments}
              tip={
                hasJointPayments
                  ? 'Their own paycheck withholding, plus joint estimated payments split in proportion to allocated liability.'
                  : 'Income tax withheld from their own paychecks, Paid Out and projected.'
              }
            />
            <Row label={model.refund.total >= 0 ? 'Projected refund' : 'Projected amount due'} values={model.refund} strong signed />
          </tbody>
        </table>
      </div>
    </Card>
  )
}
