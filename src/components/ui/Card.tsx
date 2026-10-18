import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Provenance } from '@/lib/core/types'
import '@/components/ui/card.css'

interface CardProps {
  title?: ReactNode
  /** Controls on the right of the header (toggles, links). */
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function Card({ title, actions, className = '', children }: CardProps) {
  return (
    <section className={`tt-panel ${className}`}>
      {(title || actions) && (
        <header className="tt-panel-header">
          {title && <h2 className="tt-panel-title">{title}</h2>}
          {actions && <div className="tt-panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/** Small info icon whose explanation shows on hover/focus and is read by screen readers. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="tt-infotip" tabIndex={0} aria-label={text} data-tip={text} role="note">
      <Info size={14} aria-hidden="true" />
    </span>
  )
}

const PROVENANCE_LABELS: Record<Provenance | 'mixed', string> = {
  actual: 'Actual',
  projected: 'Projected',
  manual_estimate: 'Estimate',
  mixed: 'Actual + projected',
}

/** Text label for actual / projected / estimate; never color alone (spec §2.4). */
export function ProvenanceBadge({ status }: { status: Provenance | 'mixed' }) {
  return <span className={`tt-badge tt-badge--${status}`}>{PROVENANCE_LABELS[status]}</span>
}
