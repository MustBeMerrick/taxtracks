import { describe, expect, it } from 'vitest'
import { cents } from '../money'
import type { PayrollRecord } from '../types'
import { simulateWithholding, type WithholdingElectionInput } from './simulate'

const NO_BENEFITS = {
  medical: 0,
  dental: 0,
  vision: 0,
  healthcareFsa: 0,
  dependentFsa: 0,
  hsa: 0,
  hsaEmployer: 0,
  retirementPreTax: 0,
  gtliImputed: 0,
}

function election(overrides: Partial<WithholdingElectionInput> = {}): WithholdingElectionInput {
  return {
    federal: { filingStatus: 'mfj', step2Checkbox: false, step3Credits: 0, step4aOtherIncome: 0, step4bDeductions: 0, step4cExtra: 0 },
    california: { filingStatus: 'married', regularAllowances: 0, estimatedDeductionAllowances: 0, additionalWithholding: 0 },
    benefits: { ...NO_BENEFITS },
    ...overrides,
  }
}

function stub(id: string, payDate: string, overrides: Partial<PayrollRecord> = {}): PayrollRecord {
  return {
    id,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    taxYear: 2026,
    taxpayerId: 'marc',
    employer: 'Acme',
    payDate,
    status: 'projected',
    gross: cents(9185.42),
    preTax: 0,
    federalWithholding: cents(1_000),
    caWithholding: cents(500),
    socialSecurity: cents(569.50),
    medicare: cents(133.19),
    caSdi: cents(119.41),
    ...overrides,
  }
}

describe('simulateWithholding', () => {
  it('leaves Paid Out rows untouched and only recomputes the rest', () => {
    const records = [
      stub('a', '2026-01-15', { status: 'actual' }),
      stub('b', '2026-01-30'),
    ]
    const sim = simulateWithholding(records, election(), 2026)
    expect(sim.paychecks).toHaveLength(1)
    expect(sim.paychecks[0].record.id).toBe('b')
  })

  it('caps Social Security at the wage base across the simulated walk', () => {
    // Already-paid wages this year sit $200 under the $184,500 cap.
    const paidGross = cents(184_500 - 200)
    const records = [
      stub('paid', '2026-01-15', { status: 'actual', gross: paidGross, socialSecurity: cents((184_500 - 200) * 0.062) }),
      // Two remaining checks of $9,185.42 each: the first should only tax $200 of it, the second $0.
      stub('b', '2026-01-30', { gross: cents(9185.42) }),
      stub('c', '2026-02-13', { gross: cents(9185.42) }),
    ]
    const sim = simulateWithholding(records, election(), 2026)
    expect(sim.paychecks).toHaveLength(2)
    expect(sim.paychecks[0].simulated.socialSecurity).toBe(cents(200 * 0.062))
    expect(sim.paychecks[1].simulated.socialSecurity).toBe(0)
  })

  it('totals combine Paid Out actuals with the newly simulated amounts', () => {
    const records = [
      stub('a', '2026-01-15', { status: 'actual', federalWithholding: cents(1_111), caWithholding: cents(222) }),
      stub('b', '2026-01-30'),
    ]
    const sim = simulateWithholding(records, election({ federal: { ...election().federal, step4cExtra: cents(50) } }), 2026)
    const simulatedB = sim.paychecks[0].simulated
    expect(sim.current.federal).toBe(cents(1_111) + records[1].federalWithholding)
    expect(sim.simulated.federal).toBe(cents(1_111) + simulatedB.federal)
    expect(sim.current.ca).toBe(cents(222) + records[1].caWithholding)
  })
})
