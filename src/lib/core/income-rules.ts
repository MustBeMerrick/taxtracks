import type { FilingStatus } from './filing-status'
import { CA_RATE_TABLES_2026 } from './withholding/ca-rate-tables-2026'
import { cents, type Cents } from './money'
import type { CaRateRow } from './withholding/types'

/*
 * Year-keyed rules for the income summary (not withholding). Standard deductions: federal per
 * IRS Rev. Proc. 2025-32 (as are the brackets and capital gains breakpoints); California as used in Marc's own spreadsheet (confirm against the
 * FTB's 2026 figures when published). Capital losses offset ordinary income up to $3,000
 * ($1,500 married filing separately) federally and in California.
 */

/** Rate schedule: tax = base-free marginal rates, each applying to income over `over`. */
export interface Bracket {
  over: number
  rate: number
}

export interface IncomeRules {
  federalStandardDeduction: Record<FilingStatus, Cents>
  californiaStandardDeduction: Record<FilingStatus, Cents>
  capitalLossLimit: Record<FilingStatus, Cents>
  /** Federal ordinary-income brackets (Rev. Proc. 2025-32). Null where this app has no verified table. */
  federalBrackets: Partial<Record<FilingStatus, Bracket[]>>
  /** Long-term capital gains / qualified dividends: top of the 0% band and top of the 15% band. */
  capitalGainsBreakpoints: Partial<Record<FilingStatus, { zeroTop: Cents; fifteenTop: Cents }>>
  /** Net investment income tax and Additional Medicare tax (statutory, not inflation-indexed). */
  niitRate: number
  niitThreshold: Record<FilingStatus, Cents>
  additionalMedicareRate: number
  additionalMedicareThreshold: Record<FilingStatus, Cents>
  /** California rate schedule (annual): tax = base + rate × (income − over). */
  californiaRates: Partial<Record<FilingStatus, CaRateRow[]>>
  /** California personal exemption credit. */
  californiaExemptionCredit: Record<FilingStatus, Cents>
}

const bracketsFrom = (rows: [number, number][]): Bracket[] => rows.map(([over, rate]) => ({ over: cents(over), rate }))
const MFJ_BRACKETS = bracketsFrom([[0, 0.1], [24_800, 0.12], [100_800, 0.22], [211_400, 0.24], [403_550, 0.32], [512_450, 0.35], [768_700, 0.37]])
const SINGLE_BRACKETS = bracketsFrom([[0, 0.1], [12_400, 0.12], [50_400, 0.22], [105_700, 0.24], [201_775, 0.32], [256_225, 0.35], [640_600, 0.37]])
const MFS_BRACKETS = bracketsFrom([[0, 0.1], [12_400, 0.12], [50_400, 0.22], [105_700, 0.24], [201_775, 0.32], [256_225, 0.35], [384_350, 0.37]])

/**
 * The EDD's withholding tables use 110% of California's statutory rates (1.1%, 2.2% … 14.63% instead of
 * 1%, 2% … 13.3%) so that withholding runs a little high. Liability uses the statutory rates, so divide
 * the EDD rates and base amounts by 1.1. Bracket thresholds are the EDD's 2026 indexed figures.
 */
const EDD_WITHHOLDING_FACTOR = 1.1
const caRows = (key: 'single' | 'married'): CaRateRow[] =>
  CA_RATE_TABLES_2026.annual[key].map((r) => ({
    over: r.over,
    rate: Math.round((r.rate / EDD_WITHHOLDING_FACTOR) * 10_000) / 10_000,
    base: Math.round((r.base / EDD_WITHHOLDING_FACTOR) * 100) / 100,
  }))

const RULES_2026: IncomeRules = {
  federalStandardDeduction: {
    single: cents(16_100),
    mfj: cents(32_200),
    mfs: cents(16_100),
    hoh: cents(24_150),
    qss: cents(32_200),
  },
  californiaStandardDeduction: {
    single: cents(5_850),
    mfj: cents(11_700),
    mfs: cents(5_850),
    hoh: cents(11_700),
    qss: cents(11_700),
  },
  capitalLossLimit: {
    single: cents(3_000),
    mfj: cents(3_000),
    mfs: cents(1_500),
    hoh: cents(3_000),
    qss: cents(3_000),
  },
  // Head of household is left out on purpose: its brackets are not in this app yet, so the estimate stays off.
  federalBrackets: { single: SINGLE_BRACKETS, mfj: MFJ_BRACKETS, qss: MFJ_BRACKETS, mfs: MFS_BRACKETS },
  capitalGainsBreakpoints: {
    mfj: { zeroTop: cents(98_900), fifteenTop: cents(613_700) },
    qss: { zeroTop: cents(98_900), fifteenTop: cents(613_700) },
    single: { zeroTop: cents(49_450), fifteenTop: cents(545_500) },
    mfs: { zeroTop: cents(49_450), fifteenTop: cents(306_850) },
  },
  niitRate: 0.038,
  niitThreshold: { single: cents(200_000), mfj: cents(250_000), mfs: cents(125_000), hoh: cents(200_000), qss: cents(250_000) },
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: { single: cents(200_000), mfj: cents(250_000), mfs: cents(125_000), hoh: cents(200_000), qss: cents(250_000) },
  // California's own 2026 schedule isn't published yet; thresholds are the EDD's 2026 annual schedule (Method B Tables 5-28), at statutory rates.
  californiaRates: { single: caRows('single'), mfs: caRows('single'), mfj: caRows('married'), qss: caRows('married') },
  // EDD 2026 Method B Table 4 is $168.30 per allowance, also at 110%: the credit itself is $153. Joint filers get two.
  californiaExemptionCredit: { single: cents(153), mfj: cents(306), mfs: cents(153), hoh: cents(153), qss: cents(306) },
}

const RULES_BY_YEAR: Record<number, IncomeRules> = { 2026: RULES_2026 }

export const getIncomeRules = (taxYear: number): IncomeRules | undefined => RULES_BY_YEAR[taxYear]
