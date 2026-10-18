import { Users } from 'lucide-react'
import { useMemo } from 'react'
import { useAppState } from '../../app/AppStateProvider'
import * as sample from '../../fixtures/sample2026'
import { IncomeComposition } from './IncomeComposition'
import { Kpis } from './Kpis'
import { buildOverview } from './model'
import { FederalVsState, InvestmentTable, PaycheckSummary, RecentActivity, WithholdingProgress } from './Panels'
import { PaymentsChart } from './PaymentsChart'
import './overview.css'

export default function OverviewPage() {
  const { scope, scopeLabel } = useAppState()
  // Sample fixtures until persistence lands (Phase 4).
  const model = useMemo(() => buildOverview(sample, scope), [scope])

  return (
    <div className="tt-overview">
      <p className="tt-sample-banner" role="note">
        Sample data for layout review. Figures are illustrative, not tax calculations.
      </p>
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
        <RecentActivity items={model.activity} asOf={sample.SAMPLE_AS_OF} />
      </div>
    </div>
  )
}
