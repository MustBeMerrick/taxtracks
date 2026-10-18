import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { NAV_ITEMS } from '../app/nav'
import { Logo } from '../brand/Logo'
import { Segmented } from '../components/ui/controls'
import { useTheme } from '../theme/ThemeProvider'
import type { ThemePreference } from '../theme/theme'
import './pages.css'

/** iPhone "More" tab: sections that don't fit the tab bar, plus theme. */
export default function More() {
  const { preference, setPreference } = useTheme()
  return (
    <div className="tt-more">
      <ul className="tt-more-list tt-card">
        {NAV_ITEMS.filter((item) => !item.primaryOnMobile).map(({ path, label, icon: Icon }) => (
          <li key={path}>
            <Link to={path}>
              <Icon size={20} aria-hidden="true" />
              {label}
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="tt-card tt-more-theme">
        <span className="tt-field-label">Appearance</span>
        <Segmented<ThemePreference>
          label="Appearance"
          value={preference}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={setPreference}
        />
      </div>
      <Logo layout="stacked" size={48} tagline="Your taxes. On track." />
    </div>
  )
}
