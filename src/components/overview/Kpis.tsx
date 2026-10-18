'use client'

import { CircleAlert, CircleCheck, CreditCard, Landmark } from 'lucide-react'
import { InfoTip, ProvenanceBadge } from '@/components/ui/Card'
import { formatMoney, formatPercent, ratio, type Cents } from '@/lib/core/money'
import type { ByJurisdiction, OverviewModel } from '@/lib/core/overview'

/** Within this share of liability, the projected result counts as on track. */
const ON_TRACK_TOLERANCE = 0.02

export function Kpis({ model }: { model: OverviewModel }) {
  const { refund, liability, payments, income, effectiveRates } = model
  const isRefund = refund.total >= 0
  const onTrack = Math.abs(ratio(refund.total, liability.total)) <= ON_TRACK_TOLERANCE

  return (
    <div className="tt-kpis">
      <article className="tt-kpi tt-kpi--hero">
        <header>
          <span>{isRefund ? 'Projected refund' : 'Projected amount due'}</span>
          <InfoTip text="Projected payments minus projected income-tax liability. Positive is a refund, negative is an amount due." />
          <span className={`tt-status-pill${onTrack ? '' : ' tt-status-pill--warn'}`}>
            {onTrack ? <CircleCheck size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
            {onTrack ? 'On track' : 'Review'}
          </span>
        </header>
        <p className={`tt-kpi-hero-value ${isRefund ? 'tt-signed-positive' : 'tt-signed-negative'}`}>
          {formatMoney(refund.total, { sign: 'auto' })}
        </p>
        <p className="tt-kpi-note">
          {formatPercent(Math.abs(ratio(refund.total, liability.total)))} of liability ·{' '}
          {isRefund ? 'over-withheld' : 'under-withheld'}
        </p>
        <SplitRows values={refund} signed />
      </article>

      <article className="tt-kpi">
        <header>
          <span>Total tax liability</span>
          <InfoTip text="Projected federal and California income tax. Payroll taxes (Social Security, Medicare, SDI) are not included." />
          <Landmark size={18} className="tt-kpi-icon" aria-hidden="true" />
        </header>
        <p className="tt-kpi-value">{formatMoney(liability.total)}</p>
        <ProvenanceBadge status={model.liabilityStatus} />
        <SplitRows values={liability} />
      </article>

      <article className="tt-kpi">
        <header>
          <span>Total paid (projected)</span>
          <InfoTip text="Withholding recorded to date plus projected withholding on remaining paychecks." />
          <CreditCard size={18} className="tt-kpi-icon" aria-hidden="true" />
        </header>
        <p className="tt-kpi-value">{formatMoney(payments.total)}</p>
        <p className="tt-kpi-note">
          {formatMoney(model.paymentsActual.total, { precision: 'whole' })} actual to date
        </p>
        <SplitRows values={payments} />
      </article>

      <article className="tt-kpi">
        <header>
          <span>{income.excludesJointIncome ? 'Wage income' : 'Total income'}</span>
          <InfoTip
            text={
              income.excludesJointIncome
                ? 'W-2 wages (gross less pre-tax deductions) attributable to this taxpayer. Joint investment income is excluded.'
                : 'W-2 wages (gross less pre-tax deductions) + net short- and long-term gains/losses + dividends & interest + other income, before capital-loss limits.'
            }
          />
        </header>
        <p className="tt-kpi-value">{formatMoney(income.total)}</p>
        <p className="tt-kpi-note">{income.components.length} components · see breakdown</p>
      </article>

      <article className="tt-kpi">
        <header>
          <span>Effective tax rates</span>
          <InfoTip text="Projected income-tax liability ÷ total household income." />
        </header>
        <dl className="tt-kpi-rates">
          <dt>Federal</dt>
          <dd>{formatPercent(effectiveRates.federal)}</dd>
          <dt>California</dt>
          <dd>{formatPercent(effectiveRates.ca)}</dd>
          <dt>Combined</dt>
          <dd>{formatPercent(effectiveRates.combined)}</dd>
        </dl>
      </article>
    </div>
  )
}

function SplitRows({ values, signed = false }: { values: ByJurisdiction; signed?: boolean }) {
  const fmt = (v: Cents) => formatMoney(v, { sign: signed ? 'auto' : 'negative' })
  return (
    <dl className="tt-kpi-split">
      <dt>Federal</dt>
      <dd>{fmt(values.federal)}</dd>
      <dt>California</dt>
      <dd>{fmt(values.ca)}</dd>
    </dl>
  )
}
