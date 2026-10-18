import type { Metadata } from 'next'
import { Payroll } from '@/components/pages/sections'

export const metadata: Metadata = { title: 'Payroll & Withholding' }

export default function Page() {
  return <Payroll />
}
