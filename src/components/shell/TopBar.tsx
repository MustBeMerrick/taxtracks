import { RefreshCw, Settings } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { useAppState } from '../../app/AppStateProvider'
import { FILING_STATUS_LABELS } from '../../app/filingStatus'
import { pageTitleFor } from '../../app/nav'
import { Mark } from '../../brand/Logo'
import { Select } from '../ui/controls'
import { ThemeToggle } from './ThemeToggle'

const timestamp = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })

export function TopBar() {
  const app = useAppState()
  const { pathname } = useLocation()
  const title = pageTitleFor(pathname)
  useEffect(() => {
    document.title = title === 'Tax Tracks' ? title : `${title} · Tax Tracks`
  }, [title])
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
            Last updated
            <br />
            <span className="num">{app.lastCalculatedAt ? timestamp.format(app.lastCalculatedAt) : 'Not yet calculated'}</span>
          </span>
          <button type="button" className="tt-button" onClick={app.recalculate} disabled={app.isRecalculating}>
            <RefreshCw size={16} className={app.isRecalculating ? 'tt-spin' : undefined} aria-hidden="true" />
            <span className="tt-recalc-label">Recalculate</span>
          </button>
        </div>

        <ThemeToggle />
        <Link to="/settings" className="tt-icon-button" aria-label="Settings" title="Settings">
          <Settings size={18} />
        </Link>
      </div>
    </header>
  )
}
