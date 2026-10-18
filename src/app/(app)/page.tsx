import { OverviewView } from '@/components/overview/OverviewView'
import { getRepository, selectedYear } from '@/lib/data'

export default async function OverviewPage() {
  return <OverviewView data={getRepository().yearData(await selectedYear())} />
}
