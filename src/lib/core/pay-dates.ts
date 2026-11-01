import type { IsoDate } from './types'

/*
 * Semi-monthly pay dates: the 15th and the last day of each month. When one lands on a
 * Saturday or Sunday, pay moves back to the Friday before; weekdays stay as they are.
 */

const DAY_MS = 86_400_000

const toUtc = (iso: IsoDate) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const fromUtc = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10)

/** Saturday → the Friday before, Sunday → the Friday before; any weekday is returned unchanged. */
export function adjustForWeekend(iso: IsoDate): IsoDate {
  const ms = toUtc(iso)
  const weekday = new Date(ms).getUTCDay() // 0 Sun … 6 Sat
  if (weekday === 6) return fromUtc(ms - DAY_MS)
  if (weekday === 0) return fromUtc(ms - 2 * DAY_MS)
  return iso
}

/** The 24 pay dates of a year, in order (two per month). */
export function semiMonthlyPayDates(year: number): IsoDate[] {
  const dates: IsoDate[] = []
  for (let month = 1; month <= 12; month++) {
    const mm = String(month).padStart(2, '0')
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
    dates.push(adjustForWeekend(`${year}-${mm}-15`), adjustForWeekend(`${year}-${mm}-${String(lastDay).padStart(2, '0')}`))
  }
  return dates
}

export const isSemiMonthlyPayDate = (iso: IsoDate): boolean => semiMonthlyPayDates(Number(iso.slice(0, 4))).includes(iso)

/** The first pay date after `after` (or the year's first), for pre-filling the next paystub. */
export function nextPayDate(year: number, after?: IsoDate): IsoDate | undefined {
  return semiMonthlyPayDates(year).find((d) => after === undefined || d > after)
}

const SHORT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

/** "Fri, Oct 30": pay dates are shown without the year (the tax year is already selected at the top of the app). */
export const formatPayDate = (iso: IsoDate): string => SHORT.format(new Date(`${iso}T00:00:00Z`))
