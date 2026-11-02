import { describe, expect, it } from 'vitest'
import { BROKERAGES, centsToInput, entryTotal, findEntry, profitLoss, validateInvestmentEntry } from './investments'
import { cents } from './money'

const ok = { taxpayerId: 'marc', brokerage: 'betterment', dividends: cents(100), shortTermProfit: cents(30), shortTermLoss: cents(80), longTermProfit: cents(200), longTermLoss: 0, final: false }

describe('brokerages', () => {
  it('lists the six accounts in order, with Fundrise on NAV distributions', () => {
    expect(BROKERAGES.map((b) => b.name)).toEqual(['Betterment', 'LPL', 'Robinhood', 'Vanguard', 'Wealthfront', 'Fundrise'])
    expect(BROKERAGES.filter((b) => b.navDistributions).map((b) => b.key)).toEqual(['fundrise'])
  })
})

describe('validateInvestmentEntry', () => {
  it('nets profit minus loss per term and maps final to actual, estimate to manual_estimate', () => {
    const est = validateInvestmentEntry(ok, ['marc'], 2026)
    expect(est.ok && est.fields.status).toBe('manual_estimate')
    expect(est.ok && est.fields.shortTerm).toBe(cents(-50))
    expect(est.ok && est.fields.longTerm).toBe(cents(200))
    expect(est.ok && est.fields.shortTermLoss).toBe(cents(80))
    const fin = validateInvestmentEntry({ ...ok, final: true }, ['marc'], 2026)
    expect(fin.ok && fin.fields.status).toBe('actual')
  })

  it('rejects unknown people and brokerages, negative amounts, fractional cents and Fundrise short-term or loss', () => {
    expect(validateInvestmentEntry(ok, ['mae'], 2026).ok).toBe(false)
    expect(validateInvestmentEntry({ ...ok, brokerage: 'nope' }, ['marc'], 2026).ok).toBe(false)
    expect(validateInvestmentEntry({ ...ok, shortTermLoss: -1 }, ['marc'], 2026).ok).toBe(false)
    expect(validateInvestmentEntry({ ...ok, longTermProfit: 1.5 }, ['marc'], 2026).ok).toBe(false)
    expect(validateInvestmentEntry({ ...ok, brokerage: 'fundrise' }, ['marc'], 2026).ok).toBe(false)
    expect(validateInvestmentEntry({ ...ok, brokerage: 'fundrise', shortTermProfit: 0, shortTermLoss: 0 }, ['marc'], 2026).ok).toBe(true)
  })
})

describe('input helpers', () => {
  it('shows zero as blank', () => {
    expect(centsToInput(0)).toBe('')
    expect(centsToInput(cents(1234567.89))).toBe('1,234,567.89')
  })

  it('splits a legacy net into profit or loss, and keeps entered sides', () => {
    expect(profitLoss({ shortTerm: -500, longTerm: 700 })).toEqual({ shortTerm: { profit: 0, loss: 500 }, longTerm: { profit: 700, loss: 0 } })
    expect(profitLoss({ shortTerm: -50, longTerm: 0, shortTermProfit: 30, shortTermLoss: 80 }).shortTerm).toEqual({ profit: 30, loss: 80 })
    expect(profitLoss(undefined).longTerm).toEqual({ profit: 0, loss: 0 })
  })

  it('totals and finds rows by owner and brokerage', () => {
    const row = { shortTerm: 100, longTerm: -300, dividendsInterest: 50 }
    expect(entryTotal(row)).toBe(-150)
    const records = [{ id: 'a', owner: 'marc', brokerage: 'lpl', ...row }] as never
    expect(findEntry(records, 'marc', 'lpl')?.id).toBe('a')
    expect(findEntry(records, 'mae', 'lpl')).toBeUndefined()
    const dupes = [
      { id: 'old', owner: 'marc', brokerage: 'lpl', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'new', owner: 'marc', brokerage: 'lpl', updatedAt: '2026-06-01T00:00:00Z' },
    ] as never
    expect(findEntry(dupes, 'marc', 'lpl')?.id).toBe('new')
  })
})
