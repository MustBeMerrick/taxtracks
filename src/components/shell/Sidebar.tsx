'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS, navItemFor } from '@/components/app/nav'
import { Logo, Mark } from '@/components/brand/Logo'

export function Sidebar() {
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

    </aside>
  )
}

function SidebarLink({ path, label, icon: Icon }: (typeof NAV_ITEMS)[number]) {
  const active = navItemFor(usePathname())?.path === path
  return (
    <li>
      <Link href={path} className={`tt-nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} title={label}>
        <Icon size={20} aria-hidden="true" />
        <span className="tt-nav-label">{label}</span>
      </Link>
    </li>
  )
}
