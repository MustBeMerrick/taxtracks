import type { Metadata } from 'next'
import { SettingsView } from '@/components/settings/SettingsView'
import { getRepository } from '@/lib/data'

export const metadata: Metadata = { title: 'Settings & Tax Data' }

export default function SettingsPage() {
  const repository = getRepository()
  return (
    <SettingsView
      data={{
        isSample: repository.isSample(),
        counts: {
          paychecks: repository.count('payroll'),
          investments: repository.count('investmentSummaries'),
          runs: repository.count('calculationRuns'),
        },
        audit: repository.recentAudit(),
      }}
    />
  )
}
