// Brand, token and icon reference sheet (dev only, at /dev/brand).
import { Logo, Mark } from '../brand/Logo'
import { useTheme } from '../theme/ThemeProvider'
import type { ThemePreference } from '../theme/theme'

const swatches = [
  'brand-teal', 'brand-teal-deep', 'brand-graphite', 'brand-slate', 'brand-off-white',
  'app-bg', 'sidebar-bg', 'surface', 'surface-raised', 'surface-inset', 'border',
  'text-primary', 'text-secondary', 'text-muted', 'accent', 'accent-hover', 'accent-soft',
  'chart-secondary', 'positive', 'negative', 'warning',
]

export default function BrandPreview() {
  const { preference, setPreference } = useTheme()
  return (
    <main style={{ padding: 32, display: 'grid', gap: 32, maxWidth: 1100 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['light', 'dark', 'system'] as ThemePreference[]).map((p) => (
          <button key={p} onClick={() => setPreference(p)} aria-pressed={preference === p}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer',
              background: preference === p ? 'var(--accent-soft)' : 'var(--surface)' }}>
            {p}
          </button>
        ))}
      </div>
      <section style={{ display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap' }}>
        <Logo size={96} />
        <Logo size={44} tagline="Your taxes. On track." />
        <Logo layout="inline" size={44} />
        <Logo layout="stacked" size={64} />
        <Logo size={44} mono />
        <Mark size={64} />
        <Mark size={16} />
      </section>
      <section style={{ display: 'flex', gap: 24 }}>
        {['/icons/icon-192.png', '/icons/maskable-192.png', '/apple-touch-icon.png', '/icons/icon-light-512.png'].map((src) => (
          <img key={src} src={src} width={96} height={96} alt={src} style={{ borderRadius: 20 }} />
        ))}
      </section>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {swatches.map((s) => (
          <div key={s} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ height: 44, background: `var(--${s})` }} />
            <div style={{ padding: 8, fontSize: 12, color: 'var(--text-secondary)' }}>--{s}</div>
          </div>
        ))}
      </section>
      <p className="num" style={{ fontSize: 32, fontWeight: 600, color: 'var(--positive)', margin: 0 }}>+$181.24</p>
    </main>
  )
}
