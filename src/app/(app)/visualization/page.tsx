import type { Metadata } from 'next'
import { VisualizationView } from '@/components/visualization/VisualizationView'
import { buildVisualization } from '@/lib/core/visualization'
import { getRepository, selectedAllocationMethod, selectedYear } from '@/lib/data'

export const metadata: Metadata = { title: 'Visualization' }

export default async function Page() {
  const year = await selectedYear()
  const repository = getRepository()
  const people = repository.all('taxpayers').map((t) => ({ id: t.id, name: t.name }))
  const filingStatus = repository.taxYears().find((t) => t.year === year)?.filingStatus
  return (
    <VisualizationView
      data={buildVisualization(year, people, repository.engineRecords(year))}
      initialFiling={filingStatus === 'mfs' ? 'separate' : 'joint'}
      initialMethod={await selectedAllocationMethod()}
    />
  )
}
