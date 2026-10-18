import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  applyTheme,
  onSystemThemeChange,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
  type ResolvedTheme,
  type ThemePreference,
} from './theme'

interface ThemeContextValue {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (pref: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(readThemePreference)
  const [resolved, setResolved] = useState(() => resolveTheme(preference))

  useEffect(() => {
    const update = () => setResolved(resolveTheme(preference))
    update()
    return preference === 'system' ? onSystemThemeChange(update) : undefined
  }, [preference])

  useEffect(() => applyTheme(resolved), [resolved])

  const setPreference = useCallback((pref: ThemePreference) => {
    writeThemePreference(pref)
    setPreferenceState(pref)
  }, [])

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference])
  return <ThemeContext value={value}>{children}</ThemeContext>
}

// oxlint-disable-next-line react/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
