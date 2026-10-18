'use client'

import { useId } from 'react'
import { MARK_SVG } from '@/components/brand/mark-svg'
import '@/components/brand/logo.css'

type Layout = 'horizontal' | 'inline' | 'stacked'

interface LogoProps {
  layout?: Layout
  /** Monochrome renders the track and "Tracks" in the ink colour. */
  mono?: boolean
  /** Mark height in px; the wordmark scales with it. */
  size?: number
  tagline?: string
  className?: string
}

export function Mark({ size = 32, mono = false }: { size?: number; mono?: boolean }) {
  // Each instance needs its own gradient id: browsers drop url(#id) fills
  // when the first element with that id sits inside a hidden subtree.
  const gradientId = `tt-track-${useId().replace(/:/g, '')}`
  return (
    <span
      className={`tt-mark${mono ? ' tt-mono' : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: MARK_SVG.replaceAll('tt-track', gradientId) }}
    />
  )
}

export function Logo({ layout = 'horizontal', mono = false, size = 40, tagline, className = '' }: LogoProps) {
  return (
    <span
      className={`tt-logo tt-logo--${layout}${mono ? ' tt-mono' : ''} ${className}`}
      style={{ '--tt-size': `${size}px` } as React.CSSProperties}
      role="img"
      aria-label="Tax Tracks"
    >
      <Mark size={size} mono={mono} />
      <span className="tt-wordmark-group">
        <span className="tt-wordmark">
          <span className="tt-tax">Tax</span> <span className="tt-tracks">Tracks</span>
        </span>
        {tagline && <span className="tt-tagline">{tagline}</span>}
      </span>
    </span>
  )
}
