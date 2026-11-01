import { describe, expect, it } from 'vitest'
import { adjustForWeekend, isSemiMonthlyPayDate, nextPayDate, semiMonthlyPayDates } from './pay-dates'

describe('adjustForWeekend', () => {
  it('leaves weekdays alone', () => {
    for (const d of ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']) expect(adjustForWeekend(d)).toBe(d)
  })
  it('moves Saturday and Sunday back to the Friday before', () => {
    expect(adjustForWeekend('2026-10-31')).toBe('2026-10-30') // Sat
    expect(adjustForWeekend('2026-11-15')).toBe('2026-11-13') // Sun
  })
  it('crosses month and year boundaries', () => {
    expect(adjustForWeekend('2028-01-01')).toBe('2027-12-31') // Sat
    expect(adjustForWeekend('2026-03-01')).toBe('2026-02-27') // Sun
  })
})

describe('semiMonthlyPayDates', () => {
  const dates2026 = semiMonthlyPayDates(2026)
  it('has 24 ascending dates, none on a weekend', () => {
    expect(dates2026).toHaveLength(24)
    expect([...dates2026].sort()).toEqual(dates2026)
    for (const d of dates2026) expect([0, 6]).not.toContain(new Date(`${d}T00:00:00Z`).getUTCDay())
  })
  it('uses the 15th and month-end, shifting only weekend dates', () => {
    expect(dates2026.slice(18)).toEqual([
      '2026-10-15', // Thursday: stays
      '2026-10-30', // Oct 31 is a Saturday
      '2026-11-13', // Nov 15 is a Sunday
      '2026-11-30', // Monday: stays
      '2026-12-15', // Tuesday: stays
      '2026-12-31', // Thursday: stays
    ])
  })
  it('handles leap-year February', () => {
    expect(semiMonthlyPayDates(2028).slice(2, 4)).toEqual(['2028-02-15', '2028-02-29'])
  })
})

describe('helpers', () => {
  it('recognises pay dates and finds the next one', () => {
    expect(isSemiMonthlyPayDate('2026-11-13')).toBe(true)
    expect(isSemiMonthlyPayDate('2026-11-15')).toBe(false) // a Sunday: paid on the 13th
    expect(isSemiMonthlyPayDate('2026-11-14')).toBe(false)
    expect(nextPayDate(2026, '2026-10-30')).toBe('2026-11-13')
    expect(nextPayDate(2026)).toBe('2026-01-15')
    expect(nextPayDate(2026, '2026-12-31')).toBeUndefined()
  })
})
