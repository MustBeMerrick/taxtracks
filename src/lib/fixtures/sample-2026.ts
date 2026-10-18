import type {
  ActivityItem,
  Household,
  IncomeSource,
  InvestmentSourceSummary,
  LiabilityEstimate,
  OtherIncome,
  PayrollRecord,
  RecordMeta,
  TaxYear,
  Taxpayer,
} from '@/lib/core/types'
import { applyRate, cents, type Cents } from '@/lib/core/money'

/*
 * SAMPLE DATA ONLY. Shaped after the design mockups so the dashboard has
 * something realistic to show. Payroll-tax lines use simplified flat rates
 * and liabilities are hand-entered placeholders, not tax-engine output.
 * Everything else on the Overview is derived from these records.
 */

export const SAMPLE_AS_OF = '2026-10-17'
export const SAMPLE_YEAR = 2026
const HOUSEHOLD_ID = 'household'
const STAMP = '2026-10-17T19:42:00.000Z'
const SOURCE = 'Sample data'

/** Record bookkeeping for seeded rows. */
const meta = (id: string): RecordMeta => ({ id, createdAt: STAMP, updatedAt: STAMP, source: SOURCE })

export const household: Household = { ...meta(HOUSEHOLD_ID), name: 'Household', isSample: true }

export const taxpayers: Taxpayer[] = [
  { ...meta('marc'), householdId: HOUSEHOLD_ID, name: 'Marc' },
  { ...meta('mae'), householdId: HOUSEHOLD_ID, name: 'Mae' },
]

export const taxYears: TaxYear[] = [
  { ...meta('ty-2026'), householdId: HOUSEHOLD_ID, year: SAMPLE_YEAR, filingStatus: 'mfj', jurisdictions: ['federal', 'ca'] },
]

export const incomeSources: IncomeSource[] = [
  { ...meta('northwind'), householdId: HOUSEHOLD_ID, name: 'Northwind Labs', kind: 'employer', owner: 'marc' },
  { ...meta('contoso'), householdId: HOUSEHOLD_ID, name: 'Contoso Health', kind: 'employer', owner: 'mae' },
  ...['Betterment', 'Vanguard', 'Robinhood', 'Wealthfront', 'Fundrise'].map(
    (name): IncomeSource => ({ ...meta(name.toLowerCase()), householdId: HOUSEHOLD_ID, name, kind: 'brokerage', owner: 'joint' }),
  ),
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
      ...meta(`${taxpayerId}-${c.payDate}-${i}`),
      taxYear: SAMPLE_YEAR,
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

const investment = (id: string, name: string, st: number, lt: number, divInt: number, status: InvestmentSourceSummary['status']): InvestmentSourceSummary => ({
  ...meta(`inv-${id}`),
  taxYear: SAMPLE_YEAR,
  name,
  shortTerm: cents(st),
  longTerm: cents(lt),
  dividendsInterest: cents(divInt),
  status,
})

export const investments: InvestmentSourceSummary[] = [
  investment('betterment', 'Betterment', -142, 2_160, 3_400, 'manual_estimate'),
  investment('vanguard', 'Vanguard', 73, 1_100, 200, 'manual_estimate'),
  investment('robinhood', 'Robinhood', -10_465, 0, 0, 'actual'),
  investment('wealthfront', 'Wealthfront', 0, -41, 750, 'manual_estimate'),
  investment('fundrise', 'Fundrise', 0, 212, 525, 'manual_estimate'),
]

export const otherIncome: OtherIncome[] = [
  { ...meta('bank-bonus'), taxYear: SAMPLE_YEAR, label: 'Bank bonus', owner: 'joint', amount: cents(648.86), status: 'manual_estimate' },
]

export const liabilities: LiabilityEstimate[] = [
  { ...meta('liab-federal'), taxYear: SAMPLE_YEAR, jurisdiction: 'federal', amount: cents(40_837.41), status: 'manual_estimate' },
  { ...meta('liab-ca'), taxYear: SAMPLE_YEAR, jurisdiction: 'ca', amount: cents(16_504.63), status: 'manual_estimate' },
]

export const activity: ActivityItem[] = [
  { ...meta('a1'), date: '2026-10-15', label: 'October 15 paychecks not entered yet', kind: 'warning' },
  { ...meta('a2'), date: '2026-09-30', label: 'Added September paychecks (4)', kind: 'done' },
  { ...meta('a3'), date: '2026-09-24', label: 'Updated investment P/L (Robinhood)', kind: 'done' },
  { ...meta('a4'), date: '2026-09-10', label: 'Checked extra withholding (W-4 calculator)', kind: 'done' },
  { ...meta('a5'), date: '2026-08-12', label: 'Updated W-4 (additional $4)', kind: 'done' },
  { ...meta('a6'), date: '2026-10-31', label: 'Next payroll (projected)', kind: 'upcoming' },
  { ...meta('a7'), date: '2027-01-15', label: 'Q4 estimated tax due (if needed)', kind: 'upcoming' },
]

/** The sample data keyed by database table, for seeding. */
export function sampleTables() {
  return {
    households: [household],
    taxpayers,
    taxYears,
    incomeSources,
    payroll,
    investmentSummaries: investments,
    otherIncome,
    liabilities,
    activity,
  }
}
