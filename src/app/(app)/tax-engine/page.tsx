import type { Metadata } from 'next'
import { IncomeCalculations } from '@/components/income/IncomeCalculations'
import { SeparateReturnsTotalCard, TaxEstimateCard } from '@/components/income/TaxEstimateCard'
import { estimateHouseholdTax, estimateSeparateReturns } from '@/lib/core/tax-liability'
import type { PayrollRecord } from '@/lib/core/types'
import { getRepository, selectedYear } from '@/lib/data'

export const metadata: Metadata = { title: 'Tax Engine' }

const withheldOn = (payroll: PayrollRecord[]) => ({
  federal: payroll.reduce((t, p) => t + p.federalWithholding, 0),
  ca: payroll.reduce((t, p) => t + p.caWithholding, 0),
})

export default async function Page() {
  const year = await selectedYear()
  const repository = getRepository()
  const data = repository.yearData(year)
  const records = repository.engineRecords(year)
  const filingStatus = repository.taxYears().find((t) => t.year === year)?.filingStatus ?? 'mfj'
  // Filing separately, each spouse has their own return; the household total adds them together.
  const separate = filingStatus === 'mfs' ? estimateSeparateReturns(year, records) : null
  const household = filingStatus === 'mfs' ? null : estimateHouseholdTax(year, filingStatus, records)
  const people = separate
    ? data.taxpayers.map((t) => ({ name: t.name, ...separate.people[t.id], withheld: withheldOn(data.payroll.filter((p) => p.taxpayerId === t.id)) }))
    : []
  return (
    <div className="tt-stubs">
      <IncomeCalculations
        year={year}
        taxpayers={data.taxpayers.map((t) => ({ id: t.id, name: t.name }))}
        investments={data.investments}
        paystubs={data.payroll}
        carryovers={records.carryovers}
        deductions={records.deductions}
        taxPayments={records.taxPayments}
        filingStatus={filingStatus}
      />
      {household && (
        <TaxEstimateCard
          estimate={household.estimate}
          summary={household.summary}
          withheld={withheldOn(data.payroll)}
          taxYear={year}
          filingStatus={filingStatus}
        />
      )}
      {people.map((p) => (
        <TaxEstimateCard key={p.name} estimate={p.estimate} summary={p.summary} withheld={p.withheld} taxYear={year} filingStatus={filingStatus} person={p.name} />
      ))}
      {people.length > 1 && <SeparateReturnsTotalCard people={people} />}
    </div>
  )
}
