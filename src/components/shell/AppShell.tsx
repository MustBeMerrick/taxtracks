import { Outlet } from 'react-router'
import { BottomNav } from './BottomNav'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import './shell.css'

export function AppShell() {
  return (
    <div className="tt-shell">
      <a href="#main" className="tt-skip-link">
        Skip to content
      </a>
      <Sidebar />
      <div className="tt-main-column">
        <TopBar />
        <main id="main" className="tt-main">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
