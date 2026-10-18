import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { FilingStatus } from './filingStatus'

// Shell-level selections. Household and taxpayer data move to the
// persistence layer in Phase 4; these fixtures only drive the controls.

export interface TaxpayerRef {
  id: string
  name: string
}

/** 'household' or a taxpayer id. Individual scope filters attributable data only (spec §3). */
export type Scope = 'household' | string

interface AppState {
  taxYear: number
  taxYears: number[]
  setTaxYear: (year: number) => void
  filingStatus: FilingStatus
  setFilingStatus: (status: FilingStatus) => void
  taxpayers: TaxpayerRef[]
  scope: Scope
  setScope: (scope: Scope) => void
  scopeLabel: string
  lastCalculatedAt: Date | null
  isRecalculating: boolean
  recalculate: () => void
}

const AppStateContext = createContext<AppState | null>(null)

const FIXTURE_TAXPAYERS: TaxpayerRef[] = [
  { id: 'marc', name: 'Marc' },
  { id: 'mae', name: 'Mae' },
]

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [taxYear, setTaxYear] = useState(2026)
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('mfj')
  const [scope, setScope] = useState<Scope>('household')
  const [lastCalculatedAt, setLastCalculatedAt] = useState<Date | null>(null)
  const [isRecalculating, setIsRecalculating] = useState(false)

  // Placeholder until the tax engine exists.
  const recalculate = useCallback(() => {
    setIsRecalculating(true)
    setTimeout(() => {
      setLastCalculatedAt(new Date())
      setIsRecalculating(false)
    }, 400)
  }, [])

  const value = useMemo<AppState>(() => {
    const taxpayer = FIXTURE_TAXPAYERS.find((t) => t.id === scope)
    return {
      taxYear,
      taxYears: [2026],
      setTaxYear,
      filingStatus,
      setFilingStatus,
      taxpayers: FIXTURE_TAXPAYERS,
      scope,
      setScope,
      scopeLabel: taxpayer?.name ?? 'Household',
      lastCalculatedAt,
      isRecalculating,
      recalculate,
    }
  }, [taxYear, filingStatus, scope, lastCalculatedAt, isRecalculating, recalculate])

  return <AppStateContext value={value}>{children}</AppStateContext>
}

// oxlint-disable-next-line react/only-export-components
export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
