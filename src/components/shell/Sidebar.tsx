import { NavLink } from 'react-router'
import { useAppState } from '../../app/AppStateProvider'
import { FILING_STATUS_LABELS, type FilingStatus } from '../../app/filingStatus'
import { NAV_ITEMS } from '../../app/nav'
import { Logo, Mark } from '../../brand/Logo'
import { Segmented, Select } from '../ui/controls'

export function Sidebar() {
  const app = useAppState()
  const main = NAV_ITEMS.filter((item) => !item.footer)
  const footer = NAV_ITEMS.filter((item) => item.footer)

  return (
    <aside className="tt-sidebar">
      <div className="tt-sidebar-brand">
        <Logo size={40} tagline="Your taxes. On track." className="tt-sidebar-logo" />
        <span className="tt-sidebar-mark">
          <Mark size={36} />
        </span>
      </div>

      <nav aria-label="Primary">
        <ul className="tt-nav">
          {main.map((item) => (
            <SidebarLink key={item.path} {...item} />
          ))}
        </ul>
        <hr className="tt-nav-divider" />
        <ul className="tt-nav">
          {footer.map((item) => (
            <SidebarLink key={item.path} {...item} />
          ))}
        </ul>
      </nav>

      <div className="tt-sidebar-controls">
        <Select
          label="Tax year"
          value={app.taxYear}
          options={app.taxYears.map((y) => ({ value: y, label: String(y) }))}
          onChange={app.setTaxYear}
        />
        <Select<FilingStatus>
          label="Filing status"
          value={app.filingStatus}
          options={Object.entries(FILING_STATUS_LABELS).map(([value, label]) => ({ value: value as FilingStatus, label }))}
          onChange={app.setFilingStatus}
        />
        <div>
          <span className="tt-field-label">View</span>
          <Segmented
            label="View"
            value={app.scope}
            options={[{ value: 'household', label: 'Household' }, ...app.taxpayers.map((t) => ({ value: t.id, label: t.name }))]}
            onChange={app.setScope}
          />
        </div>
      </div>
    </aside>
  )
}

function SidebarLink({ path, label, icon: Icon }: (typeof NAV_ITEMS)[number]) {
  return (
    <li>
      <NavLink to={path} end={path === '/'} className="tt-nav-link" title={label}>
        <Icon size={20} aria-hidden="true" />
        <span className="tt-nav-label">{label}</span>
      </NavLink>
    </li>
  )
}
