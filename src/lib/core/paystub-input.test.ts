import { describe, expect, it } from 'vitest'
import { cents } from './money'
import { EMPTY_BENEFITS } from './payroll'
import { validatePaystub, type PaystubInput } from './paystub-input'

const good: PaystubInput = {
  taxpayerId: 'marc',
  employer: ' Acme ',
  payDate: '2026-10-31',
  paidOut: true,
  gross: cents(9185.42),
  benefits: { ...EMPTY_BENEFITS, dental: cents(3.42), hsa: cents(50) },
  gtli: cents(6.7),
  employerHsa: 0,
  federalWithholding: cents(1736.53),
  caWithholding: cents(719.38),
  socialSecurity: cents(564.75),
  medicare: cents(132.08),
  caSdi: cents(119.63),
}

describe('validatePaystub', () => {
  it('builds record fields: tax year from the date, pre-tax from line items, status from Paid Out', () => {
    const r = validatePaystub(good, ['marc'], [2026])
    expect(r.ok && r.fields).toMatchObject({ taxYear: 2026, preTax: cents(53.42), status: 'actual', employer: 'Acme' })
    const unpaid = validatePaystub({ ...good, paidOut: false }, ['marc'], [2026])
    expect(unpaid.ok && unpaid.fields.status).toBe('projected')
  })

  it.each([
    ['unknown person', { taxpayerId: 'x' }],
    ['bad date', { payDate: '2026-13-45' }],
    ['unset tax year', { payDate: '2027-01-15' }],
    ['negative amount', { socialSecurity: -1 }],
    ['fractional cents', { medicare: 1.5 }],
    ['zero gross', { gross: 0 }],
    ['pre-tax over gross', { benefits: { ...EMPTY_BENEFITS, medical: cents(99_999) } }],
  ])('rejects %s', (_name, patch) => {
    expect(validatePaystub({ ...good, ...patch }, ['marc'], [2026]).ok).toBe(false)
  })
})
