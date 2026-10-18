import { describe, expect, it } from 'vitest'
import { applyRate, cents, formatMoney, sum } from './money'

describe('money', () => {
  it('converts dollars to integer cents without float drift', () => {
    expect(cents(0.1) + cents(0.2)).toBe(cents(0.3))
    expect(cents(40_837.41)).toBe(4_083_741)
  })

  it('sums cents exactly', () => {
    expect(sum([cents(0.1), cents(0.2), cents(0.3)])).toBe(60)
  })

  it('rounds rates half away from zero', () => {
    expect(applyRate(50, 0.5)).toBe(25)
    expect(applyRate(5, 0.5)).toBe(3)
    expect(applyRate(-5, 0.5)).toBe(-3)
  })

  it('formats signs explicitly', () => {
    expect(formatMoney(18_124)).toBe('$181.24')
    expect(formatMoney(18_124, { sign: 'auto' })).toBe('+$181.24')
    expect(formatMoney(-8_467)).toBe('−$84.67')
    expect(formatMoney(5_734_204, { precision: 'compact' })).toBe('$57.3K')
  })
})
