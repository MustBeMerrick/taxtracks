import { describe, expect, it } from 'vitest'
import { cents } from './money'
import { EMPTY_AFTER_TAX, EMPTY_BENEFITS } from './payroll'
import { validatePaystub, type PaystubInput } from './paystub-input'

const good: PaystubInput = {
  taxpayerId: 'marc',
  employer: ' Acme ',
  payDate: '2026-10-31',
  paidOut: true,
  gross: cents(9185.42),
  benefits: { ...EMPTY_BENEFITS, dental: cents(3.42), hsa: cents(50) },
  afterTax: EMPTY_AFTER_TAX,
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

  it('keeps after-tax deductions out of pre-tax, and omits them when all zero', () => {
    const r = validatePaystub({ ...good, afterTax: { hospitalIndemnity: cents(6.46), other: 0 } }, ['marc'], [2026])
    expect(r.ok && r.fields).toMatchObject({ preTax: cents(53.42), afterTax: { hospitalIndemnity: cents(6.46), other: 0 } })
    const none = validatePaystub(good, ['marc'], [2026])
    expect(none.ok && 'afterTax' in none.fields).toBe(false)
  })

  it('records the bonus flag, and clears it when unchecked', () => {
    const bonus = validatePaystub({ ...good, bonus: true }, ['marc'], [2026])
    expect(bonus.ok && bonus.fields.bonus).toBe(true)
    const regular = validatePaystub(good, ['marc'], [2026])
    expect(regular.ok && regular.fields.bonus).toBe(false)
  })

  it.each([
    ['unknown person', { taxpayerId: 'x' }],
    ['bad date', { payDate: '2026-13-45' }],
    ['unset tax year', { payDate: '2027-01-15' }],
    ['negative amount', { socialSecurity: -1 }],
    ['fractional cents', { medicare: 1.5 }],
    ['zero gross', { gross: 0 }],
    ['negative after-tax', { afterTax: { hospitalIndemnity: -1, other: 0 } }],
    ['missing after-tax lines', { afterTax: { hospitalIndemnity: 0 } as never }],
    ['pre-tax over gross', { benefits: { ...EMPTY_BENEFITS, medical: cents(99_999) } }],
  ])('rejects %s', (_name, patch) => {
    expect(validatePaystub({ ...good, ...patch }, ['marc'], [2026]).ok).toBe(false)
  })
})
