'use client'

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react'
import { formatMoney } from '@/lib/core/money'
import type { BracketView, Segment, SegmentKind } from '@/lib/core/visualization'
import { useSceneTween, type Scene, type Values } from '@/components/visualization/useSceneTween'

type Person = { id: string; name: string }

export const rateLabel = (r: number) => `${+(r * 100).toFixed(1)}%`

/** Person colors follow the taxpayer order, never the bar they sit in: the first taxpayer (Marc) is blue, the second teal. */
const PERSON_SERIES = [2, 1, 3, 4]
export const colorFor = (index: number) => `var(--series-${PERSON_SERIES[index % 4]})`

const KIND_LABELS: Record<SegmentKind, string> = {
  income: 'Income',
  wages: 'Wages',
  investments: 'Investment income',
  ltcg: 'Long-term gains',
}

const MARGIN = { top: 12, right: 48, bottom: 32, left: 72 }
const MAX_BAR = 120
const DURATION = 650

type Meta = { type: 'slice'; segment: Segment; fill: string } | { type: 'line'; rate: number } | { type: 'label'; text: string }

/** Shapes appear by fading in (slices also grow up from their base), and leave the same way in reverse. */
const hidden = (v: Values): Values => ('y0' in v ? { ...v, y1: v.y0, o: 0 } : { ...v, o: 0 })

/** Ordinary income (by income's pooled slices and wages alike), investment income and long-term gains. */
const groupOf = (kind: SegmentKind) => (kind === 'investments' ? 'inv' : kind === 'ltcg' ? 'lt' : 'ord')

/**
 * The picture as keyed shapes. A slice's key is who it belongs to, what kind of income it is and the rate it's taxed
 * at, so switching the split or filing slides each person's 12% slice (say) from one spot to the other.
 * Bars sit at a center `c` in a band `b`, both fractions of the plot width.
 */
function sceneOf(view: BracketView, people: Person[]): Scene<Meta> {
  const shapes: Scene<Meta>['shapes'] = {}
  const indexOf = (id: string) => Math.max(0, people.findIndex((p) => p.id === id))
  const n = view.bars.length

  // Show the next bracket edge above the tallest bar when it's near enough to read headroom against.
  const top = Math.max(...view.bars.map((b) => b.total), 1)
  const next = view.lines.find((l) => l.at > top)
  const yMax = next && next.at < top * 1.6 ? Math.max(next.at * 1.06, top * 1.08) : top * 1.1

  view.bars.forEach((bar, i) => {
    const c = (i + 0.5) / n
    shapes[`x:${bar.key}`] = { values: { c, o: 1 }, meta: { type: 'label', text: bar.label } }
    for (const s of bar.segments) {
      const base = `s:${view.jurisdiction}:${s.person}:${groupOf(s.kind)}:${s.rate}`
      let key = base
      for (let k = 2; key in shapes; k++) key = `${base}#${k}`
      const fill = s.kind === 'investments' || s.kind === 'ltcg' ? `url(#tt-viz-${s.person}-${s.kind})` : colorFor(indexOf(s.person))
      shapes[key] = { values: { c, b: 1 / n, y0: s.from, y1: s.to, o: 1 }, meta: { type: 'slice', segment: s, fill } }
    }
  })
  for (const l of view.lines) {
    if (l.at <= yMax) shapes[`l:${view.jurisdiction}:${l.rate}`] = { values: { at: l.at, o: 1 }, meta: { type: 'line', rate: l.rate } }
  }
  return { yMax, shapes }
}

function useSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size] as const
}

/** Hatched fills: the person's color, 45° for investment income and 135° for long-term gains. */
function Patterns({ people }: { people: Person[] }) {
  return (
    <defs>
      {people.flatMap((p, i) =>
        (['investments', 'ltcg'] as const).map((kind) => (
          <pattern
            key={`${p.id}-${kind}`}
            id={`tt-viz-${p.id}-${kind}`}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${kind === 'investments' ? 45 : 135})`}
          >
            <rect width={6} height={6} fill={colorFor(i)} fillOpacity={0.35} />
            <line x1={0} y1={0} x2={0} y2={6} stroke={colorFor(i)} strokeWidth={3} />
          </pattern>
        )),
      )}
    </defs>
  )
}

/** Stacked bars of taxable income against dashed bracket edges; slices animate between pictures. */
export function BracketChart({ view, people }: { view: BracketView; people: Person[] }) {
  const scene = useMemo(() => sceneOf(view, people), [view, people])
  const frame = useSceneTween(scene, DURATION, hidden, hidden)
  const [ref, { width, height }] = useSize()
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null)
  const clipId = useId()

  const plotW = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotH = Math.max(0, height - MARGIN.top - MARGIN.bottom)
  const bottom = MARGIN.top + plotH
  const right = MARGIN.left + plotW
  const yOf = (v: number) => MARGIN.top + plotH * (1 - v / frame.yMax)
  const inView = (v: number) => v <= frame.yMax * 1.0001

  const shapes = Object.entries(frame.shapes)
  const firstRate = view.bars.flatMap((b) => b.segments).find((s) => s.kind !== 'ltcg' && s.from === 0)?.rate
  const hovered = hover ? frame.shapes[hover.key]?.meta : undefined

  function track(key: string, e: PointerEvent) {
    const box = ref.current?.getBoundingClientRect()
    if (box) setHover({ key, x: e.clientX - box.left, y: e.clientY - box.top })
  }

  return (
    <div ref={ref} className="tt-viz-plot" role="img" aria-label={summary(view, people)}>
      {width > 0 && (
        <svg width={width} height={height} aria-hidden="true">
          <Patterns people={people} />
          <clipPath id={clipId}>
            <rect x={MARGIN.left} y={MARGIN.top} width={plotW} height={plotH} />
          </clipPath>

          <g clipPath={`url(#${clipId})`}>
            {shapes.map(([key, { values: v, meta }]) => {
              if (meta.type !== 'slice') return null
              const w = Math.min(MAX_BAR, v.b * plotW * 0.6)
              const y = yOf(v.y1)
              return (
                <rect
                  key={key}
                  x={MARGIN.left + v.c * plotW - w / 2}
                  y={y}
                  width={w}
                  height={Math.max(0, yOf(v.y0) - y)}
                  fill={meta.fill}
                  stroke="var(--surface)"
                  strokeWidth={2}
                  opacity={v.o}
                  onPointerMove={(e) => track(key, e)}
                  onPointerLeave={() => setHover(null)}
                />
              )
            })}
          </g>

          <line x1={MARGIN.left} x2={right} y1={bottom} y2={bottom} stroke="var(--border)" />
          {firstRate !== undefined && (
            <text x={right + 6} y={bottom - 4} fill="var(--text-muted)" fontSize={11}>
              {rateLabel(firstRate)}
            </text>
          )}

          {shapes.map(([key, { values: v, meta }]) => {
            if (meta.type === 'line' && inView(v.at)) {
              const y = yOf(v.at)
              return (
                <g key={key} opacity={v.o}>
                  <line x1={MARGIN.left} x2={right} y1={y} y2={y} stroke="var(--text-muted)" strokeDasharray="5 4" strokeWidth={1.5} />
                  <text x={MARGIN.left - 8} y={y} dy="0.35em" textAnchor="end" fill="var(--text-secondary)" fontSize={11}>
                    {formatMoney(v.at, { precision: 'whole' })}
                  </text>
                  <text x={right + 6} y={y} dy="0.35em" fill="var(--text-secondary)" fontSize={11}>
                    {rateLabel(meta.rate)}
                  </text>
                </g>
              )
            }
            if (meta.type === 'label') {
              return (
                <text key={key} x={MARGIN.left + v.c * plotW} y={bottom + 20} textAnchor="middle" opacity={v.o} fill="var(--text-secondary)" fontSize={13}>
                  {meta.text}
                </text>
              )
            }
            return null
          })}
        </svg>
      )}
      {hover && hovered?.type === 'slice' && (
        <div
          className="tt-tooltip tt-viz-tooltip"
          style={{ left: hover.x, top: hover.y, transform: `translate(${hover.x > width / 2 ? 'calc(-100% - 12px)' : '12px'}, 12px)` }}
        >
          <SegmentDetails segment={hovered.segment} people={people} />
        </div>
      )}
    </div>
  )
}

function SegmentDetails({ segment: s, people }: { segment: Segment; people: Person[] }) {
  return (
    <>
      <strong>
        {people.find((p) => p.id === s.person)?.name ?? s.person} · {KIND_LABELS[s.kind]}
      </strong>
      <dl>
        <dt>Slice</dt>
        <dd>
          {formatMoney(s.from, { precision: 'whole' })} – {formatMoney(s.to, { precision: 'whole' })}
        </dd>
        <dt>Amount</dt>
        <dd>{formatMoney(s.to - s.from, { precision: 'whole' })}</dd>
        <dt>{s.kind === 'ltcg' ? 'Capital gains rate' : 'Bracket'}</dt>
        <dd>{rateLabel(s.rate)}</dd>
        <dt>Tax on it</dt>
        <dd>{formatMoney(s.tax, { precision: 'whole' })}</dd>
      </dl>
    </>
  )
}

function summary(view: BracketView, people: Person[]): string {
  const parts = view.bars.map((b) => `${b.label}: ${formatMoney(b.total, { precision: 'whole' })} of taxable income`)
  const tax = people.map((p) => `${p.name} ${formatMoney(view.taxByPerson[p.id] ?? 0, { precision: 'whole' })}`)
  return `Stacked bars of taxable income against the tax brackets. ${parts.join('; ')}. Bracket tax: ${tax.join(', ')}.`
}
