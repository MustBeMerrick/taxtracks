'use client'

import { usePathname } from 'next/navigation'
import { useAppState } from '@/components/app/AppStateProvider'
import { FILING_STATUS_LABELS, type FilingStatus } from '@/lib/core/filing-status'
import { pageTitleFor } from '@/components/app/nav'
import { Mark } from '@/components/brand/Logo'
import { Segmented, Select } from '@/components/ui/controls'

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
          {app.scope === 'household' && (
            <p className="tt-topbar-subtitle">
              Tax year {app.taxYear} · {FILING_STATUS_LABELS[app.filingStatus]}
            </p>
          )}
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
        <Select<FilingStatus>
          label="Filing status"
          hideLabel
          className="tt-topbar-filing"
          value={app.filingStatus}
          options={Object.entries(FILING_STATUS_LABELS).map(([value, label]) => ({ value: value as FilingStatus, label }))}
          onChange={app.setFilingStatus}
        />
        <Segmented label="View" className="tt-topbar-scope" value={app.scope} options={scopeOptions} onChange={app.setScope} />
      </div>
    </header>
  )
}
