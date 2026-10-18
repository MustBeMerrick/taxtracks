'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import {
  applyTheme,
  onSystemThemeChange,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from '@/components/app/theme'

interface ThemeContextValue {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// Preference lives in localStorage; this event tells subscribers it changed in this tab.
const PREFERENCE_EVENT = 'taxtracks-theme-change'

function subscribePreference(onChange: () => void) {
  window.addEventListener(PREFERENCE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(PREFERENCE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

const systemIsDark = () => resolveTheme('system') === 'dark'

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Server render has no storage or media queries; 'system' + dark matches the default tokens.
  const preference = useSyncExternalStore(subscribePreference, readThemePreference, () => 'system' as const)
  const dark = useSyncExternalStore(onSystemThemeChange, systemIsDark, () => true)
  const resolved: ResolvedTheme = preference === 'system' ? (dark ? 'dark' : 'light') : preference

  useEffect(() => applyTheme(resolved), [resolved])

  const setPreference = useCallback((pref: ThemePreference) => {
    writeThemePreference(pref)
    window.dispatchEvent(new Event(PREFERENCE_EVENT))
  }, [])

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference])
  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
