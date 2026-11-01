import {
  Calculator,
  ChartColumn,
  ChartLine,
  LayoutDashboard,
  ReceiptText,
  Settings,
  Sigma,
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
  { path: '/payroll', label: 'Paystubs', shortLabel: 'Paystubs', title: 'Paystubs', icon: ReceiptText, primaryOnMobile: true },
  { path: '/tax-engine', label: 'Tax Engine', shortLabel: 'Engine', title: 'Tax Engine', icon: Sigma, primaryOnMobile: true },
  { path: '/calculators', label: 'Calculators', shortLabel: 'Calculators', title: 'Withholding Calculators', icon: Calculator, primaryOnMobile: false },
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
