'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { recalculate as recalculateAction, selectTaxYear, setFilingStatus as setFilingStatusAction } from '@/app/actions'
import type { FilingStatus } from '@/lib/core/filing-status'
import { useScheduleRefresh } from '@/lib/refresh-context'

// Shell-level selections and calculation status. The server (app)/layout
// loads the persisted parts; scope is a per-viewer UI choice kept here.

export interface TaxpayerRef {
  id: string
  name: string
}

/** 'household' or a taxpayer id. Individual scope filters attributable data only (spec §3). */
export type Scope = 'household' | string

/** What the server layout passes down. */
export interface ShellData {
  taxYear: number
  taxYears: number[]
  filingStatus: FilingStatus
  taxpayers: TaxpayerRef[]
  isSample: boolean
  /** ISO timestamp of the latest saved calculation, if any. */
  lastCalculatedAt: string | null
  /** Data changed since the last saved calculation (or none saved yet). */
  isStale: boolean
}

interface AppState extends Omit<ShellData, 'lastCalculatedAt'> {
  setTaxYear: (year: number) => void
  setFilingStatus: (status: FilingStatus) => void
  scope: Scope
  setScope: (scope: Scope) => void
  scopeLabel: string
  lastCalculatedAt: Date | null
  isRecalculating: boolean
  recalculate: () => void
}

const AppStateContext = createContext<AppState | null>(null)

export function AppStateProvider({ shell, children }: { shell: ShellData; children: ReactNode }) {
  const scheduleRefresh = useScheduleRefresh()
  const [selectedScope, setScope] = useState<Scope>('household')
  const [isRecalculating, setIsRecalculating] = useState(false)

  // A taxpayer removed from the data can't stay selected.
  const scope: Scope = shell.taxpayers.some((t) => t.id === selectedScope) ? selectedScope : 'household'

  const setTaxYear = useCallback(
    async (year: number) => {
      await selectTaxYear(year)
      scheduleRefresh()
    },
    [scheduleRefresh],
  )

  const setFilingStatus = useCallback(
    async (status: FilingStatus) => {
      await setFilingStatusAction(shell.taxYear, status)
      scheduleRefresh()
    },
    [shell.taxYear, scheduleRefresh],
  )

  const recalculate = useCallback(async () => {
    setIsRecalculating(true)
    try {
      await recalculateAction(shell.taxYear)
      scheduleRefresh()
    } finally {
      setIsRecalculating(false)
    }
  }, [shell.taxYear, scheduleRefresh])

  const value = useMemo<AppState>(
    () => ({
      ...shell,
      setTaxYear: (year) => void setTaxYear(year),
      setFilingStatus: (status) => void setFilingStatus(status),
      scope,
      setScope,
      scopeLabel: shell.taxpayers.find((t) => t.id === scope)?.name ?? 'Household',
      lastCalculatedAt: shell.lastCalculatedAt ? new Date(shell.lastCalculatedAt) : null,
      isRecalculating,
      recalculate: () => void recalculate(),
    }),
    [shell, setTaxYear, setFilingStatus, scope, isRecalculating, recalculate],
  )

  return <AppStateContext value={value}>{children}</AppStateContext>
}

export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
