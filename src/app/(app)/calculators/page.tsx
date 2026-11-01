import type { Metadata } from 'next'
import { SalaryPaycheckCalculator } from '@/components/calculators/SalaryPaycheckCalculator'

export const metadata: Metadata = { title: 'Withholding Calculators' }

export default function Page() {
  return <SalaryPaycheckCalculator today={new Date().toISOString().slice(0, 10)} />
}
