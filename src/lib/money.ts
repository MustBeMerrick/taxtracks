/**
 * Money is integer cents everywhere (spec §4.4: no floating-point drift).
 * Convert from dollars only at the edges (fixtures, user input).
 */
export type Cents = number

export function cents(dollars: number): Cents {
  return Math.round(dollars * 100)
}

export function sum(values: Iterable<Cents>): Cents {
  let total = 0
  for (const v of values) total += v
  return total
}

export function sumBy<T>(items: Iterable<T>, pick: (item: T) => Cents): Cents {
  let total = 0
  for (const item of items) total += pick(item)
  return total
}

/** Multiply by a rate, rounding half away from zero to the cent. */
export function applyRate(amount: Cents, rate: number): Cents {
  const raw = amount * rate
  return Math.sign(raw) * Math.round(Math.abs(raw))
}

/** Ratio of two amounts (e.g. coverage, effective rate); 0 when the denominator is 0. */
export function ratio(numerator: Cents, denominator: Cents): number {
  return denominator === 0 ? 0 : numerator / denominator
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usdCompact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})

interface FormatOptions {
  /** 'auto' prefixes "+" on positive values; 'never' formats the absolute value. */
  sign?: 'negative' | 'auto' | 'never'
  /** 'cents' (default), 'whole' dollars, or 'compact' ($57.3K). */
  precision?: 'cents' | 'whole' | 'compact'
}

export function formatMoney(amount: Cents, { sign = 'negative', precision = 'cents' }: FormatOptions = {}): string {
  const fmt = precision === 'whole' ? usdWhole : precision === 'compact' ? usdCompact : usd
  const text = fmt.format(Math.abs(amount) / 100)
  if (sign === 'never' || amount === 0) return text
  if (amount < 0) return `−${text}`
  return sign === 'auto' ? `+${text}` : text
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}
