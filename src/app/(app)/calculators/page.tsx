import type { Metadata } from 'next'
import { Calculators } from '@/components/pages/sections'

export const metadata: Metadata = { title: 'Withholding Calculators' }

export default function Page() {
  return <Calculators />
}
