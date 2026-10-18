'use client'

import { RefreshCw } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useAppState } from '@/components/app/AppStateProvider'
import { FILING_STATUS_LABELS } from '@/lib/core/filing-status'
import { pageTitleFor } from '@/components/app/nav'
import { Mark } from '@/components/brand/Logo'
import { Select } from '@/components/ui/controls'

const timestamp = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

export function TopBar() {
  const app = useAppState()
  const title = pageTitleFor(usePathname())
  const scopeOptions = [
    { value: 'household', label: 'Household' },
    ...app.taxpayers.map((t) => ({ value: t.id, label: t.name })),
  ]

  return (
    <header className="tt-topbar">
      <div className="tt-topbar-title">
        <span className="tt-topbar-mark">
          <Mark size={28} />
        </span>
        <div>
          <h1>{title}</h1>
          <p className="tt-topbar-subtitle">
            Tax year {app.taxYear} · {FILING_STATUS_LABELS[app.filingStatus]}
            {app.scope !== 'household' && <> · Viewing {app.scopeLabel}</>}
          </p>
        </div>
      </div>

      <div className="tt-topbar-actions">
        <Select
          label="Tax year"
          hideLabel
          className="tt-topbar-year"
          value={app.taxYear}
          options={app.taxYears.map((y) => ({ value: y, label: String(y) }))}
          onChange={app.setTaxYear}
        />
        <Select label="Scope" hideLabel className="tt-topbar-scope" value={app.scope} options={scopeOptions} onChange={app.setScope} />

        <div className="tt-recalc">
          <span className="tt-recalc-time">
            {app.lastCalculatedAt ? 'Last calculated' : 'Not yet calculated'}
            {app.lastCalculatedAt && (
              <>
                <br />
                <span className="num">{timestamp.format(app.lastCalculatedAt)}</span>
              </>
            )}
            {app.lastCalculatedAt && app.isStale && <span className="tt-stale"> · Data changed</span>}
          </span>
          <button
            type="button"
            className={`tt-button${app.isStale ? ' tt-button--stale' : ''}`}
            onClick={app.recalculate}
            disabled={app.isRecalculating}
            title={app.isStale ? 'Data changed since the last calculation' : 'Results are up to date'}
          >
            <RefreshCw size={16} className={app.isRecalculating ? 'tt-spin' : undefined} aria-hidden="true" />
            <span className="tt-recalc-label">Recalculate</span>
            {app.isStale && <span className="visually-hidden"> (data changed since last calculation)</span>}
          </button>
        </div>

      </div>
    </header>
  )
}
