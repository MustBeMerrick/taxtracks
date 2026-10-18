'use client'

import { Ellipsis } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS, navItemFor } from '@/components/app/nav'

/** iPhone tab bar: primary sections plus "More" for the rest. */
export function BottomNav() {
  const pathname = usePathname()
  const current = navItemFor(pathname)
  const inMore = pathname === '/more' || (current !== undefined && !current.primaryOnMobile)

  return (
    <nav className="tt-bottomnav" aria-label="Primary">
      {NAV_ITEMS.filter((item) => item.primaryOnMobile).map(({ path, shortLabel, icon: Icon }) => (
        <Link key={path} href={path} className={`tt-bottomnav-link${current?.path === path ? ' active' : ''}`} aria-current={current?.path === path ? 'page' : undefined}>
          <Icon size={22} aria-hidden="true" />
          <span>{shortLabel}</span>
        </Link>
      ))}
      <Link href="/more" className={`tt-bottomnav-link${inMore ? ' active' : ''}`} aria-current={inMore ? 'page' : undefined}>
        <Ellipsis size={22} aria-hidden="true" />
        <span>More</span>
      </Link>
    </nav>
  )
}
