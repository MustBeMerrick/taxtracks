'use client'

import { Users } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { setAllocationMethod } from '@/app/actions'
import { useAppState } from '@/components/app/AppStateProvider'
import { AllocationCard } from '@/components/overview/AllocationCard'
import { IncomeComposition } from '@/components/overview/IncomeComposition'
import { Kpis } from '@/components/overview/Kpis'
import { FederalVsState, InvestmentTable, PaycheckSummary, RecentActivity, WithholdingProgress } from '@/components/overview/Panels'
import { PaymentsChart } from '@/components/overview/PaymentsChart'
import { Card } from '@/components/ui/Card'
import type { AllocationMethod, LiabilityAllocation } from '@/lib/core/liability-allocation'
import { formatPercent } from '@/lib/core/money'
import { buildOverview, type OverviewInput } from '@/lib/core/overview'
import '@/components/overview/overview.css'

/** Renders the Overview from the year's records; scope filtering and the liability split happen client-side. */
export function OverviewView({
  data,
  allocations,
  initialMethod,
}: {
  data: OverviewInput
  /** Both splits of the joint liability, from the server (null when the engine has no tables for the year). */
  allocations: Record<AllocationMethod, LiabilityAllocation> | null
  initialMethod: AllocationMethod
}) {
  const { scope, scopeLabel, taxYear, isSample } = useAppState()
  const [method, setMethod] = useState<AllocationMethod>(initialMethod)
  const model = useMemo(() => buildOverview({ ...data, allocation: allocations?.[method] }, scope), [data, allocations, method, scope])

  function changeMethod(next: AllocationMethod) {
    setMethod(next)
    // Remembered for next time; the split itself is already on screen, so a failed save only loses the preference.
    setAllocationMethod(next).catch(() => {})
  }

  if (data.payroll.length === 0 && data.liabilities.length === 0 && data.investments.length === 0) {
    return (
      <Card title={`No data for ${taxYear} yet`} className="tt-empty">
        <p>The Overview fills in once there are paychecks, income or liability estimates for this tax year.</p>
        <ul>
          <li>
            Add paychecks in <Link href="/payroll">Paystubs</Link>
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
          Viewing {scopeLabel}: income, paychecks and withholding are {scopeLabel}’s. Liability is {scopeLabel}’s {formatPercent(model.liabilityShare)} share of
          the joint estimate, {model.allocation?.method === 'source_attributed' ? 'split by source' : 'proportional to income'}.
        </p>
      )}
      <Kpis model={model} />
      {scope !== 'household' && (
        <AllocationCard model={model} name={scopeLabel} method={method} onMethodChange={changeMethod} canAttribute={allocations !== null} />
      )}
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
