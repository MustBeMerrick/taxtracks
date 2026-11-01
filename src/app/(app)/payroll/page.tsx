import type { Metadata } from 'next'
import { PaystubsView } from '@/components/paystubs/PaystubsView'
import { getRepository, selectedYear } from '@/lib/data'

export const metadata: Metadata = { title: 'Paystubs' }

export default async function Page() {
  const year = await selectedYear()
  const data = getRepository().yearData(year)
  return (
    <PaystubsView
      year={year}
      taxpayers={data.taxpayers.map((t) => ({ id: t.id, name: t.name }))}
      paystubs={data.payroll}
      today={new Date().toISOString().slice(0, 10)}
    />
  )
}
