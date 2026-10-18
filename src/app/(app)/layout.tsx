import type { ReactNode } from 'react'
import { AppStateProvider, type ShellData } from '@/components/app/AppStateProvider'
import { AppShell } from '@/components/shell/AppShell'
import { getRepository, selectedYear } from '@/lib/data'

// Every page reads live data from SQLite.
export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const repository = getRepository()
  const year = await selectedYear()
  const years = repository.taxYears()
  const latestRun = repository.latestRun(year)
  const changedAt = repository.dataChangedAt()

  const shell: ShellData = {
    taxYear: year,
    taxYears: years.length > 0 ? years.map((t) => t.year) : [year],
    filingStatus: years.find((t) => t.year === year)?.filingStatus ?? 'mfj',
    taxpayers: repository.all('taxpayers').map((t) => ({ id: t.id, name: t.name })),
    isSample: repository.isSample(),
    lastCalculatedAt: latestRun?.ranAt ?? null,
    isStale: !latestRun || (changedAt !== null && changedAt > latestRun.ranAt),
  }

  return (
    <AppStateProvider shell={shell}>
      <AppShell>{children}</AppShell>
    </AppStateProvider>
  )
}
