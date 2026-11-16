import type { Metadata } from 'next'
import { VisualizationView } from '@/components/visualization/VisualizationView'
import { allocateHouseholdLiability } from '@/lib/core/liability-allocation'
import { householdLiability } from '@/lib/core/tax-liability'
import { buildVisualization, effectiveRates } from '@/lib/core/visualization'
import { getRepository, selectedAllocationMethod, selectedYear } from '@/lib/data'

export const metadata: Metadata = { title: 'Visualization' }

export default async function Page() {
  const year = await selectedYear()
  const repository = getRepository()
  const people = repository.all('taxpayers').map((t) => ({ id: t.id, name: t.name }))
  const filingStatus = repository.taxYears().find((t) => t.year === year)?.filingStatus
  const records = repository.engineRecords(year)
  // Both previews whatever the year's status: a joint return's splits, and the two separate returns.
  const rates = effectiveRates(repository.yearData(year), allocateHouseholdLiability(year, 'mfj', records), householdLiability(year, 'mfs', records)?.people ?? null)
  return (
    <VisualizationView
      data={buildVisualization(year, people, records)}
      rates={rates}
      initialFiling={filingStatus === 'mfs' ? 'separate' : 'joint'}
      initialMethod={await selectedAllocationMethod()}
    />
  )
}
