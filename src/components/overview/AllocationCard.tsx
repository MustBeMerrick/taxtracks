'use client'

import { Card, InfoTip } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/controls'
import { ALLOCATION_METHODS, type AllocationMethod } from '@/lib/core/liability-allocation'
import { formatMoney, type Cents } from '@/lib/core/money'
import type { ByJurisdiction, OverviewModel } from '@/lib/core/overview'

const TIP =
  'An internal split of one jointly filed return, not a separate liability the IRS or FTB would assess. The household total is the same either way.'

const SEPARATE_TIP =
  'Their own wages, brokerage accounts and deductions. Household deductions, carried-over losses and estimated payments are split equally. California community-property splitting is not applied.'

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

/**
 * Filing jointly: a person's share of the joint liability, how it was split, and what that leaves them owing or
 * refunded. Filing separately: their own return's tax, withholding and refund.
 */
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
  const separate = model.filing === 'separate'
  if (!a && !separate) return null
  const description = a ? ALLOCATION_METHODS.find((m) => m.value === a.method)?.description : undefined
  const source = a?.method === 'source_attributed'
  const ownReturn = a?.method === 'as_if_separate' ? a.separateReturn : undefined
  const hasJointPayments = model.jointPayments.total !== 0

  return (
    <Card
      className="tt-allocation"
      title={separate ? `${name}’s separate return` : `${name}’s share of the joint return`}
      actions={
        canAttribute && !separate ? (
          <Segmented
            label="Allocation method"
            value={method}
            options={ALLOCATION_METHODS.map((m) => ({ value: m.value, label: m.shortLabel }))}
            onChange={onMethodChange}
          />
        ) : undefined
      }
    >
      <p className="tt-allocation-lead">
        {separate ? `Married filing separately: ${name} owes the tax on their own return. The Household view adds both returns together.` : description}{' '}
        <InfoTip text={separate ? SEPARATE_TIP : TIP} />
      </p>
      {a?.note && <p className="tt-muted">{a.note}</p>}
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
            {a && source && (
              <>
                <Row label="Baseline tax (wage share)" values={a.baseline} tip="The joint tax with no one’s investments, split by each person’s taxable wages." />
                <Row
                  label="Investment-related tax"
                  values={a.investment}
                  tip="How much the joint tax goes up because of this person’s own brokerage results (and any deductions they own). Negative when losses lower it."
                />
              </>
            )}
            {ownReturn && (
              <>
                <Row
                  label="Tax on their own return"
                  values={ownReturn}
                  tip="What they would owe filing separately: their own wages, brokerage accounts and deductions, with household items split equally."
                />
                <Row
                  label="Share of joint saving"
                  values={{
                    federal: model.liability.federal - ownReturn.federal,
                    ca: model.liability.ca - ownReturn.ca,
                    total: model.liability.total - ownReturn.total,
                  }}
                  tip="How much less (negative) their share is than their own return, because filing jointly costs the household less than two separate returns. Zero when both come to the same."
                  signed
                />
              </>
            )}
            <Row label={separate ? 'Liability' : 'Allocated liability'} values={model.liability} strong />
            <Row
              label={hasJointPayments ? 'Withholding & payments' : 'Withholding'}
              values={model.payments}
              tip={
                hasJointPayments
                  ? separate
                    ? 'Their own paycheck withholding, plus half of the joint estimated payments.'
                    : 'Their own paycheck withholding, plus joint estimated payments split in proportion to allocated liability.'
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
