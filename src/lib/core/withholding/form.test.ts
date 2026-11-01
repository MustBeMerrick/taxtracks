import { describe, expect, it } from 'vitest'
import { cents } from '../money'
import { defaultForm, formatDollars, formatNumberInput, formToInput, parseMoney } from './form'

describe('parseMoney', () => {
  it('accepts typed dollars', () => {
    expect(parseMoney('$1,234.50')).toBe(cents(1234.5))
    expect(parseMoney('')).toBe(0)
    expect(parseMoney('.5')).toBe(50)
  })
  it('rejects junk and negatives', () => {
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('-5')).toBeNull()
    expect(parseMoney('1.2.3')).toBeNull()
    expect(parseMoney('.')).toBeNull()
  })
})

describe('formatNumberInput', () => {
  it('groups integer digits and keeps decimals', () => {
    expect(formatNumberInput('1234567.5')).toBe('1,234,567.5')
    expect(formatNumberInput('220450')).toBe('220,450')
    expect(formatNumberInput('1,234')).toBe('1,234')
    expect(formatNumberInput('12')).toBe('12')
    expect(formatNumberInput('1234.')).toBe('1,234.')
    expect(formatNumberInput('.5')).toBe('0.5')
    expect(formatNumberInput('.')).toBe('0.')
    expect(formatNumberInput('')).toBe('')
  })
  it('drops junk and extra decimal points', () => {
    expect(formatNumberInput('$1a2,3.4.5')).toBe('123.45')
  })
  it('round-trips through parseMoney', () => {
    expect(parseMoney(formatNumberInput('9185.42'))).toBe(918542)
  })
})

describe('formatDollars', () => {
  it('always shows two decimals', () => {
    expect(formatDollars('5')).toBe('5.00')
    expect(formatDollars('1234.5')).toBe('1,234.50')
    expect(formatDollars('.5')).toBe('0.50')
    expect(formatDollars('12.')).toBe('12.00')
    expect(formatDollars('9185.426')).toBe('9,185.42')
    expect(formatDollars('')).toBe('')
  })
  it('limits typing to two decimals', () => {
    expect(formatNumberInput('1.2345', 2)).toBe('1.23')
  })
})

describe('formToInput', () => {
  const base = { ...defaultForm('2026-11-01'), salary: '220450' }

  it('converts annual salary to a per-period amount for the chosen frequency', () => {
    const semi = formToInput(base)
    expect(semi.ok && semi.input.grossPerPeriod).toBe(cents(9185.42))
    const monthly = formToInput({ ...base, payFrequency: 'monthly' })
    expect(monthly.ok && monthly.input.grossPerPeriod).toBe(cents(18370.83))
  })

  it('takes a per-paycheck salary as is, and derives the tax year from the pay date', () => {
    const r = formToInput({ ...base, payMethod: 'perPaycheck', salary: '9185.42', payDate: '2027-01-15' })
    expect(r.ok && r.input.grossPerPeriod).toBe(cents(9185.42))
    expect(r.ok && r.input.taxYear).toBe(2027)
  })

  it('computes a percent 401(k) from the per-period gross', () => {
    const r = formToInput({ ...base, retirement: '10' })
    expect(r.ok && r.input.benefits.retirementPreTax).toBe(cents(918.54))
  })

  it('reports field errors instead of a result', () => {
    const r = formToInput({ ...base, medical: 'x', caRegularAllowances: '1.5', retirement: '150' })
    expect(r.ok).toBe(false)
    expect(Object.keys(r.errors).sort()).toEqual(['caRegularAllowances', 'medical', 'retirement'])
  })
})
