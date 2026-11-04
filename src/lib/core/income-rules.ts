import type { FilingStatus } from './filing-status'
import { cents, type Cents } from './money'
import type { CaRateRow } from './withholding/types'

/*
 * Year-keyed rules for the income summary (not withholding). Federal standard deductions, brackets and
 * capital gains breakpoints: IRS Rev. Proc. 2025-32. California rate schedules, standard deductions and
 * exemption credits: FTB 2026 figures (2025 indexed by 3.4%; confirm against the FTB's published table).
 * Capital losses offset ordinary income up to $3,000 ($1,500 married filing separately) federally and in California.
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
 * California rate schedule from bracket floors (dollars) and statutory rates. Each row's base is the tax on all
 * lower brackets. The 1% Mental Health Services Tax on taxable income over $1,000,000 is folded in as an extra
 * row, as the EDD does. (Not the EDD withholding tables: those run at 110% of these rates, and their 2026
 * thresholds are the 2025 FTB schedule.)
 */
const MHST_FLOOR = 1_000_000
const caSchedule = (rows: [number, number][]): CaRateRow[] => {
  const floors = [...rows]
  const at = floors.findIndex(([over]) => over > MHST_FLOOR)
  const below = floors[(at === -1 ? floors.length : at) - 1]
  floors.splice(at === -1 ? floors.length : at, 0, [MHST_FLOOR, below[1]])
  const withMhst = floors.map(([over, rate]): [number, number] => [over, over >= MHST_FLOOR ? Math.round((rate + 0.01) * 1000) / 1000 : rate])
  let base = 0
  return withMhst.map(([over, rate], i) => {
    if (i > 0) {
      const [prevOver, prevRate] = withMhst[i - 1]
      base = Math.round((base + (over - prevOver) * prevRate) * 100) / 100
    }
    return { over, rate, base }
  })
}
// FTB 2026 Schedule X (single / MFS) and Schedule Y (MFJ / QSS = twice the single floors).
const CA_SINGLE_2026 = caSchedule([[0, 0.01], [11_456, 0.02], [27_157, 0.04], [42_861, 0.06], [59_498, 0.08], [75_197, 0.093], [384_109, 0.103], [460_927, 0.113], [768_213, 0.123]])
const CA_MFJ_2026 = caSchedule([[0, 0.01], [22_912, 0.02], [54_314, 0.04], [85_722, 0.06], [118_996, 0.08], [150_394, 0.093], [768_218, 0.103], [921_854, 0.113], [1_536_426, 0.123]])

const RULES_2026: IncomeRules = {
  federalStandardDeduction: {
    single: cents(16_100),
    mfj: cents(32_200),
    mfs: cents(16_100),
    hoh: cents(24_150),
    qss: cents(32_200),
  },
  californiaStandardDeduction: {
    single: cents(5_900),
    mfj: cents(11_800),
    mfs: cents(5_900),
    hoh: cents(11_800),
    qss: cents(11_800),
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
  // Head of household has its own schedule, not in this app yet, so its California estimate stays off.
  californiaRates: { single: CA_SINGLE_2026, mfs: CA_SINGLE_2026, mfj: CA_MFJ_2026, qss: CA_MFJ_2026 },
  // $158 per personal exemption; joint filers get two. (The phaseout starts far above this household's AGI.)
  californiaExemptionCredit: { single: cents(158), mfj: cents(316), mfs: cents(158), hoh: cents(158), qss: cents(316) },
}

const RULES_BY_YEAR: Record<number, IncomeRules> = { 2026: RULES_2026 }

export const getIncomeRules = (taxYear: number): IncomeRules | undefined => RULES_BY_YEAR[taxYear]
