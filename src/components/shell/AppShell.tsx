import type { ReactNode } from 'react'
import { BottomNav } from '@/components/shell/BottomNav'
import { Sidebar } from '@/components/shell/Sidebar'
import { TopBar } from '@/components/shell/TopBar'
import '@/components/shell/shell.css'

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="tt-shell">
      <a href="#main" className="tt-skip-link">
        Skip to content
      </a>
      <Sidebar />
      <div className="tt-main-column">
        <TopBar />
        <main id="main" className="tt-main">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
