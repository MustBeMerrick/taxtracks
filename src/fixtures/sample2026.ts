import type {
  ActivityItem,
  InvestmentSourceSummary,
  LiabilityEstimate,
  OtherIncome,
  PayrollRecord,
  Taxpayer,
} from '../domain/types'
import { applyRate, cents, type Cents } from '../lib/money'

/*
 * SAMPLE DATA ONLY. Shaped after the design mockups so the dashboard has
 * something realistic to show. Payroll-tax lines use simplified flat rates
 * and liabilities are hand-entered placeholders, not tax-engine output.
 * Everything else on the Overview is derived from these records.
 */

export const SAMPLE_AS_OF = '2026-10-17'

export const taxpayers: Taxpayer[] = [
  { id: 'marc', name: 'Marc' },
  { id: 'mae', name: 'Mae' },
]

// Simplified payroll-tax assumptions for the sample generator.
const SS_RATE = 0.062
const SS_WAGE_BASE = cents(184_500)
const MEDICARE_RATE = 0.0145
const ADDITIONAL_MEDICARE_RATE = 0.009
const ADDITIONAL_MEDICARE_THRESHOLD = cents(200_000)
const CA_SDI_RATE = 0.013
/** Paychecks on or before this date are actual; later ones are projected. */
const LAST_RECORDED_PAY_DATE = '2026-09-30'

interface Paycheck {
  payDate: string
  gross: Cents
  preTax: Cents
  federal: Cents
  ca: Cents
}

function semiMonthlyDates(year: number): string[] {
  const dates: string[] = []
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0')
    const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate()
    dates.push(`${year}-${mm}-15`, `${year}-${mm}-${lastDay}`)
  }
  return dates
}

/** Adds payroll-tax lines with running YTD wage bases. */
function buildRecords(taxpayerId: string, employer: string, checks: Paycheck[]): PayrollRecord[] {
  let ytdGross = 0
  return checks.map((c, i) => {
    const ssRemaining = Math.max(0, SS_WAGE_BASE - ytdGross)
    const overThreshold = Math.max(0, ytdGross + c.gross - Math.max(ADDITIONAL_MEDICARE_THRESHOLD, ytdGross))
    ytdGross += c.gross
    return {
      id: `${taxpayerId}-${c.payDate}-${i}`,
      taxpayerId,
      employer,
      payDate: c.payDate,
      status: c.payDate <= LAST_RECORDED_PAY_DATE ? 'actual' : 'projected',
      gross: c.gross,
      preTax: c.preTax,
      federalWithholding: c.federal,
      caWithholding: c.ca,
      socialSecurity: applyRate(Math.min(c.gross, ssRemaining), SS_RATE),
      medicare: applyRate(c.gross, MEDICARE_RATE) + applyRate(overThreshold, ADDITIONAL_MEDICARE_RATE),
      caSdi: applyRate(c.gross, CA_SDI_RATE),
    }
  })
}

const dates = semiMonthlyDates(2026)

const marcChecks: Paycheck[] = dates.map((payDate) => ({
  payDate,
  gross: cents(4_186.46),
  preTax: cents(41.64),
  federal: cents(893.48),
  ca: cents(367.57),
}))

const maeChecks: Paycheck[] = dates.flatMap((payDate) => {
  const regular = { payDate, gross: cents(14_000), preTax: cents(83.28), federal: cents(450), ca: cents(170) }
  if (payDate !== '2026-03-15') return [regular]
  // Annual bonus paid with the March 15 check, supplemental-rate withholding.
  const bonus = cents(38_216.77)
  return [regular, { payDate, gross: bonus, preTax: 0, federal: applyRate(bonus, 0.22), ca: applyRate(bonus, 0.1023) }]
})

export const payroll: PayrollRecord[] = [
  ...buildRecords('marc', 'Northwind Labs', marcChecks),
  ...buildRecords('mae', 'Contoso Health', maeChecks),
]

export const investments: InvestmentSourceSummary[] = [
  { id: 'betterment', name: 'Betterment', shortTerm: cents(-142), longTerm: cents(2_160), dividendsInterest: cents(3_400), status: 'manual_estimate' },
  { id: 'vanguard', name: 'Vanguard', shortTerm: cents(73), longTerm: cents(1_100), dividendsInterest: cents(200), status: 'manual_estimate' },
  { id: 'robinhood', name: 'Robinhood', shortTerm: cents(-10_465), longTerm: 0, dividendsInterest: 0, status: 'actual' },
  { id: 'wealthfront', name: 'Wealthfront', shortTerm: 0, longTerm: cents(-41), dividendsInterest: cents(750), status: 'manual_estimate' },
  { id: 'fundrise', name: 'Fundrise', shortTerm: 0, longTerm: cents(212), dividendsInterest: cents(525), status: 'manual_estimate' },
]

export const otherIncome: OtherIncome[] = [
  { id: 'hysa-interest-bonus', label: 'Bank bonus', amount: cents(648.86), status: 'manual_estimate' },
]

export const liabilities: LiabilityEstimate[] = [
  { jurisdiction: 'federal', amount: cents(40_837.41), status: 'manual_estimate', source: 'Sample placeholder' },
  { jurisdiction: 'ca', amount: cents(16_504.63), status: 'manual_estimate', source: 'Sample placeholder' },
]

export const activity: ActivityItem[] = [
  { id: 'a1', date: '2026-10-15', label: 'October 15 paychecks not entered yet', kind: 'warning' },
  { id: 'a2', date: '2026-09-30', label: 'Added September paychecks (4)', kind: 'done' },
  { id: 'a3', date: '2026-09-24', label: 'Updated investment P/L (Robinhood)', kind: 'done' },
  { id: 'a4', date: '2026-09-10', label: 'Equity sale scenario modeled', kind: 'done' },
  { id: 'a5', date: '2026-08-12', label: 'Updated W-4 (additional $4)', kind: 'done' },
  { id: 'a6', date: '2026-10-31', label: 'Next payroll (projected)', kind: 'upcoming' },
  { id: 'a7', date: '2027-01-15', label: 'Q4 estimated tax due (if needed)', kind: 'upcoming' },
]
