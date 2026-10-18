import type { Metadata } from 'next'
import { TaxEngine } from '@/components/pages/sections'

export const metadata: Metadata = { title: 'Tax Engine' }

export default function Page() {
  return <TaxEngine />
}
