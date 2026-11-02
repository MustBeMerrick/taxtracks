import { describe, expect, it } from 'vitest'
import * as sample from '@/lib/fixtures/sample-2026'
import { buildOverview } from '@/lib/core/overview'

const household = buildOverview(sample, 'household')

describe('overview model (spec §5 invariants)', () => {
  it('refund = payments − liability, per jurisdiction and in total', () => {
    expect(household.refund.federal).toBe(household.payments.federal - household.liability.federal)
    expect(household.refund.ca).toBe(household.payments.ca - household.liability.ca)
    expect(household.refund.total).toBe(household.payments.total - household.liability.total)
  })

  it('income components reconcile exactly to the total', () => {
    const parts = household.income.components.reduce((t, c) => t + c.amount, 0)
    expect(parts).toBe(household.income.total)
  })

  it('net ST/LT include both gains and losses', () => {
    const st = household.income.components.find((c) => c.key === 'shortTerm')!
    expect(st.amount).toBe(sample.investments.reduce((t, i) => t + i.shortTerm, 0))
    expect(st.amount).toBeLessThan(0)
  })

  it('actual + remaining projected withholding = full-year payments', () => {
    for (const w of household.withholding) {
      expect(w.actual + w.projectedRemaining).toBe(household.payments[w.jurisdiction])
    }
  })

  it('cumulative monthly withholding ends at full-year payments', () => {
    expect(household.monthly.at(-1)!.cumulative).toBe(household.payments.total)
    expect(household.lastActualMonth).toBe('Sep')
  })

  it('household paycheck totals equal the sum of taxpayers', () => {
    const { rows, total } = household.paychecks
    expect(total!.fullYear.gross).toBe(rows[0].fullYear.gross + rows[1].fullYear.gross)
    expect(total!.fullYear.federal).toBe(household.payments.federal)
  })

  it("individual scope filters attributable data and scales liability by the person's income share", () => {
    const marc = buildOverview(sample, 'marc')
    const mae = buildOverview(sample, 'mae')
    expect(household.liabilityShare).toBe(1)
    // Shares add up to the whole, and so do the scaled liabilities (to within a cent of rounding).
    expect(marc.liabilityShare + mae.liabilityShare).toBeCloseTo(1, 10)
    expect(Math.abs(marc.liability.total + mae.liability.total - household.liability.total)).toBeLessThanOrEqual(2)
    expect(marc.liability.federal).toBe(Math.round(household.liability.federal * marc.liabilityShare))
    // Payments follow the person's own paychecks, so refunds add up too.
    expect(marc.payments.total + mae.payments.total).toBe(household.payments.total)
    expect(Math.abs(marc.refund.total + mae.refund.total - household.refund.total)).toBeLessThanOrEqual(2)
    expect(marc.paychecks.rows.map((r) => r.taxpayerId)).toEqual(['marc'])
    // Brokerage results are per person; only joint "other income" stays household-only.
    expect(marc.income.components.map((c) => c.key)).toEqual(['wages', 'shortTerm', 'longTerm', 'dividendsInterest'])
  })

  it("a person's monthly chart counts only their own paychecks, so actual/projected follows them", () => {
    const marc = buildOverview(sample, 'marc')
    expect(marc.monthly.at(-1)!.cumulative).toBe(marc.payments.total)
    const mae = buildOverview(sample, 'mae')
    expect(marc.monthly.at(-1)!.cumulative + mae.monthly.at(-1)!.cumulative).toBe(household.monthly.at(-1)!.cumulative)
  })

  it('effective rates are the same for a person as for the household when liability scales with income', () => {
    const marc = buildOverview(sample, 'marc')
    expect(marc.effectiveRates.combined).toBeCloseTo(buildOverview(sample, 'household').effectiveRates.combined, 3)
  })
})
