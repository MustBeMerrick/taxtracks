'use client'

import { useEffect, useRef, useState } from 'react'

export type Values = Record<string, number>

export interface Shape<M> {
  values: Values
  meta: M
}

/** What a chart draws: keyed shapes of numbers (positions, opacity) plus the y-axis top they're measured against. */
export interface Scene<M> {
  yMax: number
  shapes: Record<string, Shape<M>>
}

const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function mix(a: Values, b: Values, t: number): Values {
  const out: Values = {}
  for (const k in b) out[k] = lerp(a[k] ?? b[k], b[k], t)
  return out
}

/**
 * Animates from the scene on screen to `target`. A shape whose key is in both slides from one position to the other;
 * a new one starts from `enter(values)`, a leaving one ends at `exit(values)` and is then dropped. A change mid-flight
 * starts from wherever things are. `target`, `enter` and `exit` must keep their identity between renders.
 */
export function useSceneTween<M>(target: Scene<M>, duration: number, enter: (v: Values) => Values, exit: (v: Values) => Values): Scene<M> {
  const [frame, setFrame] = useState(target)
  const shown = useRef(target)

  useEffect(() => {
    const from = shown.current
    if (from === target) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tracks = [...new Set([...Object.keys(from.shapes), ...Object.keys(target.shapes)])].map((key) => {
      const a = from.shapes[key]
      const b = target.shapes[key]
      return { key, meta: (b ?? a).meta, start: a ? a.values : enter(b.values), end: b ? b.values : exit(a.values) }
    })
    const begin = performance.now()
    let raf = requestAnimationFrame(function step(now) {
      const p = still ? 1 : Math.min(1, (now - begin) / duration)
      let next = target
      if (p < 1) {
        const t = ease(p)
        const shapes: Record<string, Shape<M>> = {}
        for (const track of tracks) shapes[track.key] = { meta: track.meta, values: mix(track.start, track.end, t) }
        next = { yMax: lerp(from.yMax, target.yMax, t), shapes }
        raf = requestAnimationFrame(step)
      }
      shown.current = next
      setFrame(next)
    })
    return () => cancelAnimationFrame(raf)
  }, [target, duration, enter, exit])

  return frame
}
