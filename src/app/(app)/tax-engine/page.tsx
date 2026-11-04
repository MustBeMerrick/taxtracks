import type { Metadata } from 'next'
import { IncomeCalculations } from '@/components/income/IncomeCalculations'
import { TaxEstimateCard } from '@/components/income/TaxEstimateCard'
import { FILING_STATUS_LABELS } from '@/lib/core/filing-status'
import { estimateHouseholdTax } from '@/lib/core/tax-liability'
import { getRepository, selectedYear } from '@/lib/data'

export const metadata: Metadata = { title: 'Tax Engine' }

export default async function Page() {
  const year = await selectedYear()
  const repository = getRepository()
  const data = repository.yearData(year)
  const carryovers = repository.all('carryovers', year)
  const deductions = repository.all('deductions', year)
  const taxPayments = repository.all('taxPayments')
  const filingStatus = repository.taxYears().find((t) => t.year === year)?.filingStatus ?? 'mfj'
  const household = estimateHouseholdTax(year, filingStatus, {
    taxpayerIds: data.taxpayers.map((t) => t.id),
    payroll: data.payroll,
    investments: data.investments,
    carryovers,
    deductions,
    taxPayments,
  })
  return (
    <div className="tt-stubs">
      <IncomeCalculations
        year={year}
        taxpayers={data.taxpayers.map((t) => ({ id: t.id, name: t.name }))}
        investments={data.investments}
        paystubs={data.payroll}
        carryovers={carryovers}
        deductions={deductions}
        taxPayments={taxPayments}
        filingStatus={filingStatus}
      />
      {household && (
        <TaxEstimateCard
          estimate={household.estimate}
          summary={household.summary}
          withheld={{
            federal: data.payroll.reduce((t, p) => t + p.federalWithholding, 0),
            ca: data.payroll.reduce((t, p) => t + p.caWithholding, 0),
          }}
          filingStatusLabel={FILING_STATUS_LABELS[filingStatus]}
        />
      )}
    </div>
  )
}
