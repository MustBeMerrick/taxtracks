'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { NAV_ITEMS } from '@/components/app/nav'
import { Logo } from '@/components/brand/Logo'
import { Segmented } from '@/components/ui/controls'
import { useTheme } from '@/components/app/ThemeProvider'
import type { ThemePreference } from '@/components/app/theme'
import '@/components/pages/pages.css'

/** iPhone "More" tab: sections that don't fit the tab bar, plus theme. */
export default function More() {
  const { preference, setPreference } = useTheme()
  return (
    <div className="tt-more">
      <ul className="tt-more-list tt-card">
        {NAV_ITEMS.filter((item) => !item.primaryOnMobile).map(({ path, label, icon: Icon }) => (
          <li key={path}>
            <Link href={path}>
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
