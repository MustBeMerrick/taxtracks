import { Ellipsis } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { NAV_ITEMS, navItemFor } from '../../app/nav'

/** iPhone tab bar: primary sections plus "More" for the rest. */
export function BottomNav() {
  const { pathname } = useLocation()
  const current = navItemFor(pathname)
  const inMore = pathname === '/more' || (current !== undefined && !current.primaryOnMobile)

  return (
    <nav className="tt-bottomnav" aria-label="Primary">
      {NAV_ITEMS.filter((item) => item.primaryOnMobile).map(({ path, shortLabel, icon: Icon }) => (
        <NavLink key={path} to={path} end={path === '/'} className="tt-bottomnav-link">
          <Icon size={22} aria-hidden="true" />
          <span>{shortLabel}</span>
        </NavLink>
      ))}
      <NavLink to="/more" className={`tt-bottomnav-link${inMore ? ' active' : ''}`}>
        <Ellipsis size={22} aria-hidden="true" />
        <span>More</span>
      </NavLink>
    </nav>
  )
}
