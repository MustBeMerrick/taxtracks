import type { Metadata } from 'next'
import { IncomeView } from '@/components/income/IncomeView'
import { getRepository, selectedYear } from '@/lib/data'

export const metadata: Metadata = { title: 'Income & Investments' }

export default async function Page() {
  const year = await selectedYear()
  const data = getRepository().yearData(year)
  return <IncomeView year={year} taxpayers={data.taxpayers.map((t) => ({ id: t.id, name: t.name }))} investments={data.investments} />
}
