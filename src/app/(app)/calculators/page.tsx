import type { Metadata } from 'next'
import { SalaryPaycheckCalculator } from '@/components/calculators/SalaryPaycheckCalculator'
import { getRepository, selectedYear } from '@/lib/data'

export const metadata: Metadata = { title: 'Withholding Calculators' }

export default async function Page() {
  const year = await selectedYear()
  const data = getRepository().yearData(year)
  return (
    <SalaryPaycheckCalculator
      today={new Date().toISOString().slice(0, 10)}
      taxYear={year}
      taxpayers={data.taxpayers.map((t) => ({ id: t.id, name: t.name }))}
      paystubs={data.payroll}
      liabilities={data.liabilities}
    />
  )
}
