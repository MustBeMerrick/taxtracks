'use server'

import { cookies } from 'next/headers'
import { requireSession } from '@/lib/auth/session'
import type { FilingStatus } from '@/lib/core/filing-status'
import { FILING_STATUS_LABELS } from '@/lib/core/filing-status'
import { buildOverview } from '@/lib/core/overview'
import { getRepository, YEAR_COOKIE } from '@/lib/data'
import { hashInputs } from '@/lib/repository'

// Every action re-checks the session: actions are reachable by direct POST.
// Callers await the action, then call scheduleRefresh() (see lib/refresh-context.tsx).

const RULES_VERSION = 'placeholder-liabilities'

export async function selectTaxYear(year: number): Promise<void> {
  await requireSession()
  const repository = getRepository()
  if (!repository.taxYears().some((t) => t.year === year)) throw new Error(`No data for tax year ${year}`)
  ;(await cookies()).set(YEAR_COOKIE, String(year), { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 })
}

export async function setFilingStatus(year: number, status: FilingStatus): Promise<void> {
  await requireSession()
  const repository = getRepository()
  if (!(status in FILING_STATUS_LABELS)) throw new Error('Unknown filing status')
  const record = repository.taxYears().find((t) => t.year === year)
  if (!record) throw new Error(`No data for tax year ${year}`)
  repository.put('taxYears', { ...record, filingStatus: status })
}

/** Recomputes the year's results and saves them as a reproducible snapshot. */
export async function recalculate(year: number): Promise<void> {
  await requireSession()
  const repository = getRepository()
  const input = repository.yearData(year)
  const model = buildOverview(input, 'household')
  repository.saveRun({
    taxYear: year,
    ranAt: new Date().toISOString(),
    inputsHash: hashInputs(input),
    rulesVersion: RULES_VERSION,
    outputs: {
      liability: { federal: model.liability.federal, ca: model.liability.ca },
      payments: { federal: model.payments.federal, ca: model.payments.ca },
      refund: { federal: model.refund.federal, ca: model.refund.ca },
    },
  })
}

export type ActionResult = { ok: true; message: string } | { ok: false; message: string }

/** Replaces all data with a backup file's JSON text. */
export async function restoreBackup(json: string): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  try {
    const { records } = repository.importAll(JSON.parse(json))
    return { ok: true, message: `Backup restored (${records} records).` }
  } catch (err) {
    return { ok: false, message: err instanceof SyntaxError ? 'That file is not valid JSON.' : err instanceof Error ? err.message : 'Restore failed.' }
  }
}

export async function resetToSample(): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  repository.resetToSample()
  return { ok: true, message: 'Sample data restored.' }
}

export async function clearAllData(): Promise<ActionResult> {
  await requireSession()
  const repository = getRepository()
  repository.clearAll()
  return { ok: true, message: 'All data cleared.' }
}
