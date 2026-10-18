import {
  Calculator,
  ChartColumn,
  ChartLine,
  LayoutDashboard,
  ReceiptText,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  path: string
  label: string
  /** Shorter label for the iPhone tab bar. */
  shortLabel: string
  title: string
  icon: LucideIcon
  /** Shown directly in the iPhone tab bar; the rest live under "More". */
  primaryOnMobile: boolean
  /** Rendered below a divider in the sidebar. */
  footer?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Overview', shortLabel: 'Overview', title: 'Tax Overview', icon: LayoutDashboard, primaryOnMobile: true },
  { path: '/income', label: 'Income & Investments', shortLabel: 'Income', title: 'Income & Investments', icon: ChartLine, primaryOnMobile: true },
  { path: '/payroll', label: 'Payroll & Withholding', shortLabel: 'Payroll', title: 'Payroll & Withholding', icon: ReceiptText, primaryOnMobile: true },
  { path: '/tax-engine', label: 'Tax Engine', shortLabel: 'Engine', title: 'Tax Engine', icon: Calculator, primaryOnMobile: true },
  { path: '/scenarios', label: 'Scenarios', shortLabel: 'Scenarios', title: 'Scenarios', icon: SlidersHorizontal, primaryOnMobile: false },
  { path: '/reports', label: 'Reports', shortLabel: 'Reports', title: 'Reports', icon: ChartColumn, primaryOnMobile: false },
  { path: '/settings', label: 'Settings & Tax Data', shortLabel: 'Settings', title: 'Settings & Tax Data', icon: Settings, primaryOnMobile: false, footer: true },
]

export function navItemFor(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => (item.path === '/' ? pathname === '/' : pathname.startsWith(item.path)))
}

export function pageTitleFor(pathname: string): string {
  if (pathname === '/more') return 'More'
  return navItemFor(pathname)?.title ?? 'Tax Tracks'
}
