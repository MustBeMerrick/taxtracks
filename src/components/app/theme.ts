export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'taxtracks.theme'

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Storage unavailable (private mode); fall back to system.
  }
  return 'system'
}

export function writeThemePreference(pref: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // Preference simply won't persist.
  }
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref !== 'system') return pref
  return darkQuery().matches ? 'dark' : 'light'
}

export function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#141a1f' : '#f8fafc')
}

export function onSystemThemeChange(listener: () => void) {
  const query = darkQuery()
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
