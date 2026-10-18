// Route table, not a component module.
// oxlint-disable react/only-export-components
import { lazy } from 'react'
import { createBrowserRouter } from 'react-router'
import { AppShell } from './components/shell/AppShell'
import More from './pages/More'
import OverviewPage from './features/overview/OverviewPage'
import { Calculators, Income, NotFound, Payroll, Reports, SettingsPage, TaxEngine } from './pages/sections'

const BrandPreview = lazy(() => import('./pages/BrandPreview'))

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'income', element: <Income /> },
      { path: 'payroll', element: <Payroll /> },
      { path: 'tax-engine', element: <TaxEngine /> },
      { path: 'calculators', element: <Calculators /> },
      { path: 'reports', element: <Reports /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'more', element: <More /> },
      { path: '*', element: <NotFound /> },
    ],
  },
  ...(import.meta.env.DEV ? [{ path: 'dev/brand', element: <BrandPreview /> }] : []),
])
