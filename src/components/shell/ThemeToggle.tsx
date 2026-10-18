import { Monitor, Moon, Sun } from 'lucide-react'
import { IconButton } from '../ui/controls'
import { useTheme } from '../../theme/ThemeProvider'
import type { ThemePreference } from '../../theme/theme'

const NEXT: Record<ThemePreference, ThemePreference> = { system: 'light', light: 'dark', dark: 'system' }
const ICONS = { system: Monitor, light: Sun, dark: Moon }
const LABELS = { system: 'System', light: 'Light', dark: 'Dark' }

/** Cycles System → Light → Dark. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme()
  const Icon = ICONS[preference]
  return (
    <IconButton
      label={`Theme: ${LABELS[preference]} (switch to ${LABELS[NEXT[preference]]})`}
      onClick={() => setPreference(NEXT[preference])}
    >
      <Icon size={18} />
    </IconButton>
  )
}
