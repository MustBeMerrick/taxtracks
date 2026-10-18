'use client'

import { Users } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { useAppState } from '@/components/app/AppStateProvider'
import { IncomeComposition } from '@/components/overview/IncomeComposition'
import { Kpis } from '@/components/overview/Kpis'
import { FederalVsState, InvestmentTable, PaycheckSummary, RecentActivity, WithholdingProgress } from '@/components/overview/Panels'
import { PaymentsChart } from '@/components/overview/PaymentsChart'
import { Card } from '@/components/ui/Card'
import { buildOverview, type OverviewInput } from '@/lib/core/overview'
import '@/components/overview/overview.css'

/** Renders the Overview from the year's records; scope filtering happens client-side. */
export function OverviewView({ data }: { data: OverviewInput }) {
  const { scope, scopeLabel, taxYear, isSample } = useAppState()
  const model = useMemo(() => buildOverview(data, scope), [data, scope])

  if (data.payroll.length === 0 && data.liabilities.length === 0 && data.investments.length === 0) {
    return (
      <Card title={`No data for ${taxYear} yet`} className="tt-empty">
        <p>The Overview fills in once there are paychecks, income or liability estimates for this tax year.</p>
        <ul>
          <li>
            Add paychecks in <Link href="/payroll">Payroll & Withholding</Link>
          </li>
          <li>
            Add investment results in <Link href="/income">Income & Investments</Link>
          </li>
          <li>
            Or restore a backup in <Link href="/settings">Settings › Data</Link>
          </li>
        </ul>
      </Card>
    )
  }

  return (
    <div className="tt-overview">
      {isSample && (
        <p className="tt-sample-banner" role="note">
          Sample data: figures are illustrative, not tax calculations. Clear it in Settings › Data when you start entering your own.
        </p>
      )}
      {scope !== 'household' && (
        <p className="tt-scope-banner" role="note">
          <Users size={16} aria-hidden="true" />
          Viewing {scopeLabel}: income and payroll are filtered to {scopeLabel}. Liability, payments and refund remain joint (Married Filing Jointly).
        </p>
      )}
      <Kpis model={model} />
      <div className="tt-overview-grid">
        <PaymentsChart model={model} />
        <IncomeComposition model={model} />
        <FederalVsState model={model} />
        <InvestmentTable model={model} />
        <WithholdingProgress model={model} />
        <PaycheckSummary model={model} />
        <RecentActivity items={model.activity} year={taxYear} />
      </div>
    </div>
  )
}
