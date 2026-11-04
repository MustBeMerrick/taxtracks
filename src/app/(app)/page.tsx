import { OverviewView } from '@/components/overview/OverviewView'
import { getRepository, selectedAllocationMethod, selectedYear } from '@/lib/data'

export default async function OverviewPage() {
  const year = await selectedYear()
  const repository = getRepository()
  return (
    <OverviewView
      data={repository.yearData(year)}
      allocations={repository.liabilityAllocations(year)}
      initialMethod={await selectedAllocationMethod()}
    />
  )
}
