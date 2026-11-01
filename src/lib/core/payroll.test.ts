import { describe, expect, it } from 'vitest'
import { cents } from './money'
import { EMPTY_BENEFITS, netPay, paystubRows, payrollWarnings, summarize } from './payroll'
import type { PayrollRecord } from './types'

function stub(id: string, payDate: string, overrides: Partial<PayrollRecord> = {}): PayrollRecord {
  return {
    id,
    createdAt: `2026-01-01T00:00:0${id.length}Z`,
    updatedAt: '2026-01-01T00:00:00Z',
    taxYear: 2026,
    taxpayerId: 'marc',
    employer: 'Acme',
    payDate,
    status: 'actual',
    gross: cents(9185.42),
    preTax: cents(83.28),
    federalWithholding: cents(1736.53),
    caWithholding: cents(719.38),
    socialSecurity: cents(564.75),
    medicare: cents(132.08),
    caSdi: cents(119.63),
    ...overrides,
  }
}

describe('net pay (real stub)', () => {
  it('is gross − pre-tax − taxes', () => {
    expect(netPay(stub('a', '2026-10-31'))).toBe(cents(5829.77))
  })
})

describe('year-to-date rows', () => {
  const records = [
    stub('c', '2026-10-31', { status: 'projected' }),
    stub('a', '2026-10-15'),
    stub('b', '2026-09-30'),
  ]

  it('sorts by pay date and accumulates Paid Out paychecks only', () => {
    const rows = paystubRows(records)
    expect(rows.map((r) => r.record.id)).toEqual(['b', 'a', 'c'])
    expect(rows[0].ytd.gross).toBe(cents(9185.42))
    expect(rows[1].ytd.gross).toBe(cents(9185.42 * 2))
    // The unpaid row shows the paid total so far; it doesn't add itself.
    expect(rows[2].ytd.gross).toBe(cents(9185.42 * 2))
    expect(rows[2].amounts.gross).toBe(cents(9185.42))
  })

  it('un-checking Paid Out removes a paycheck from YTD', () => {
    const rows = paystubRows(records.map((r) => (r.id === 'b' ? { ...r, status: 'projected' as const } : r)))
    expect(rows.at(-1)!.ytd.gross).toBe(cents(9185.42))
  })

  it('summarises paid vs full-year totals', () => {
    const s = summarize(records)
    expect(s.paidCount).toBe(2)
    expect(s.pendingCount).toBe(1)
    expect(s.paid.socialSecurity).toBe(cents(564.75 * 2))
    expect(s.fullYear.socialSecurity).toBe(cents(564.75 * 3))
  })
})

describe('warnings', () => {
  const today = '2026-11-01'

  it('reports nothing for a normal ledger', () => {
    expect(payrollWarnings([stub('a', '2026-10-15'), stub('b', '2026-10-30')], today)).toEqual([])
  })

  it('flags Social Security over the $11,439 annual maximum (error)', () => {
    const records = Array.from({ length: 21 }, (_, i) =>
      stub(`p${i}`, `2026-${String(Math.floor(i / 2) + 1).padStart(2, '0')}-${i % 2 === 0 ? '15' : '28'}`),
    )
    // 21 × 564.75 = 11,859.75 > 11,439.00
    const w = payrollWarnings(records, '2027-01-01')
    expect(w.find((x) => x.id === 'ss-over-cap')?.severity).toBe('error')
  })

  it('notes (info) the paycheck that reaches the cap exactly', () => {
    const full = Math.floor(11_439_00 / 56_475) // whole stubs before the cap
    const records = Array.from({ length: full }, (_, i) =>
      stub(`p${i}`, new Date(Date.UTC(2026, 0, 1 + i * 14)).toISOString().slice(0, 10)),
    )
    const remainder = 11_439_00 - full * 56_475
    records.push(stub('last', '2026-12-31', { socialSecurity: remainder }))
    const w = payrollWarnings(records, '2027-01-01')
    expect(w.find((x) => x.id === 'ss-over-cap')).toBeUndefined()
    expect(w.find((x) => x.id === 'ss-cap-reached')?.recordId).toBe('last')
  })

  it('flags contributions over annual limits', () => {
    const benefits = { ...EMPTY_BENEFITS, retirement401k: cents(30_000) }
    const w = payrollWarnings([stub('a', '2026-10-15', { benefits, preTax: cents(30_000) })], today)
    expect(w.map((x) => x.id)).toContain('401k-limit')
  })

  it('counts employer HSA toward the HSA limit', () => {
    const benefits = { ...EMPTY_BENEFITS, hsa: cents(5_000) }
    const w = payrollWarnings([stub('a', '2026-10-15', { benefits, preTax: cents(5_000), employerHsa: cents(4_000) })], today)
    expect(w.map((x) => x.id)).toContain('hsa-limit')
  })

  it('notes paystubs that are off the semi-monthly schedule, without showing the year', () => {
    const w = payrollWarnings([stub('a', '2026-10-14')], today)
    const note = w.find((x) => x.id === 'off-schedule')
    expect(note?.severity).toBe('info')
    expect(note?.message).toContain('Wed, Oct 14')
    expect(note?.message).not.toContain('2026')
  })

  it('flags negative net pay, mismatched pre-tax total, duplicates and date/paid mismatches', () => {
    const w = payrollWarnings(
      [
        stub('a', '2026-10-15', { gross: cents(100) }),
        stub('b', '2026-10-15', { benefits: { ...EMPTY_BENEFITS, medical: cents(1) } }),
        stub('c', '2026-12-31'),
        stub('d', '2026-10-31', { status: 'projected' }),
      ],
      today,
    )
    const ids = w.map((x) => x.id)
    expect(ids).toContain('neg-net-a')
    expect(ids).toContain('pretax-b')
    expect(ids).toContain('dup-b')
    expect(ids).toContain('future-paid-c')
    expect(ids).toContain('unpaid-past-d')
  })

  it('skips limit checks (with a note) for a year without rules', () => {
    const w = payrollWarnings([stub('a', '2030-01-15', { taxYear: 2030 })], '2030-02-01')
    expect(w.map((x) => x.id)).toContain('no-rules')
    expect(w.map((x) => x.id)).not.toContain('401k-limit')
  })
})
