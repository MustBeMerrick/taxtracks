import type { Metadata } from 'next'
import { Income } from '@/components/pages/sections'

export const metadata: Metadata = { title: 'Income & Investments' }

export default function Page() {
  return <Income />
}
