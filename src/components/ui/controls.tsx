'use client'

import { ChevronDown } from 'lucide-react'
import '@/components/ui/controls.css'

interface SelectProps<T extends string | number> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  /** Hide the label visually but keep it for assistive tech. */
  hideLabel?: boolean
  className?: string
}

export function Select<T extends string | number>({ label, value, options, onChange, hideLabel, className = '' }: SelectProps<T>) {
  return (
    <label className={`tt-select ${className}`}>
      <span className={hideLabel ? 'visually-hidden' : 'tt-field-label'}>{label}</span>
      <span className="tt-select-box">
        <select
          value={String(value)}
          onChange={(e) => {
            const match = options.find((o) => String(o.value) === e.target.value)
            if (match) onChange(match.value)
          }}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </span>
    </label>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}

export function Segmented<T extends string>({ label, value, options, onChange, className = '' }: SegmentedProps<T>) {
  return (
    <div className={`tt-segmented ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
