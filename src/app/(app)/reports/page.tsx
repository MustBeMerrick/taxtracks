import type { Metadata } from 'next'
import { Reports } from '@/components/pages/sections'

export const metadata: Metadata = { title: 'Reports' }

export default function Page() {
  return <Reports />
}
