import { CA_RATE_TABLES_2026 } from './ca-rate-tables-2026'
import { FED_ANNUAL_TABLES_2026 } from './fed-annual-tables-2026'
import type { CaFilingStatus, CaRateRow, PayFrequency, PerPeriod, WithholdingRules } from './types'

/** Column order used by the EDD tables below. */
const COLUMNS: PayFrequency[] = [
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
  'daily',
]

/** [weekly, biweekly, semi-monthly, monthly, quarterly, semi-annual, annual, daily] → record. */
function perPeriod(values: number[]): PerPeriod {
  return Object.fromEntries(COLUMNS.map((p, i) => [p, values[i]])) as PerPeriod
}

/** Table 1 / Table 3 rows: [single/dual, married 0–1, married 2+, head of household]. */
function statusAmounts(rows: Record<PayFrequency, [number, number, number, number]>) {
  const col = (i: number): PerPeriod =>
    Object.fromEntries(COLUMNS.map((p) => [p, rows[p][i]])) as PerPeriod
  return { single: col(0), marriedLow: col(1), marriedHigh: col(2), hoh: col(3) }
}

export const RULES_2026: WithholdingRules = {
  taxYear: 2026,

  federal: {
    // Pub 15-T (2026) Worksheet 1A, line 1g.
    step1gAllowance: { mfj: 12_900, other: 8_600 },
    tables: FED_ANNUAL_TABLES_2026,
  },

  limits: {
    // IRS Notice 2025-67 (401(k)); Rev. Proc. 2025-19 (HSA); Notice 2025-67 / OBBBA (FSAs).
    retirementDeferral: 24_500,
    healthcareFsa: 3_400,
    dependentCareFsa: 7_500,
    hsaFamily: 8_750,
  },

  fica: {
    socialSecurityRate: 0.062,
    // SSA 2026 contribution and benefit base.
    socialSecurityWageBase: 184_500,
    medicareRate: 0.0145,
    additionalMedicareRate: 0.009,
    additionalMedicareThreshold: 200_000,
  },

  california: {
    // EDD DE 44 (2026): 1.3%, no wage ceiling since 2024.
    sdiRate: 0.013,

    // Method B Table 1: Low Income Exemption.
    lowIncomeExemption: statusAmounts({
      weekly: [363, 363, 727, 727],
      biweekly: [727, 727, 1454, 1454],
      semimonthly: [787, 787, 1575, 1575],
      monthly: [1575, 1575, 3149, 3149],
      quarterly: [4724, 4724, 9448, 9448],
      semiannual: [9448, 9448, 18896, 18896],
      annual: [18896, 18896, 37791, 37791],
      daily: [73, 73, 145, 145],
    }),

    // Method B Table 2: Estimated Deduction (1..10 additional allowances).
    estimatedDeduction: [
      perPeriod([19, 38, 42, 83, 250, 500, 1000, 4]),
      perPeriod([38, 77, 83, 167, 500, 1000, 2000, 8]),
      perPeriod([58, 115, 125, 250, 750, 1500, 3000, 12]),
      perPeriod([77, 154, 167, 333, 1000, 2000, 4000, 15]),
      perPeriod([96, 192, 208, 417, 1250, 2500, 5000, 19]),
      perPeriod([115, 231, 250, 500, 1500, 3000, 6000, 23]),
      perPeriod([135, 269, 292, 583, 1750, 3500, 7000, 27]),
      perPeriod([154, 308, 333, 667, 2000, 4000, 8000, 31]),
      perPeriod([173, 346, 375, 750, 2250, 4500, 9000, 35]),
      perPeriod([192, 385, 417, 833, 2500, 5000, 10000, 38]),
    ],

    // Method B Table 3: Standard Deduction.
    standardDeduction: statusAmounts({
      weekly: [110, 110, 219, 219],
      biweekly: [219, 219, 439, 439],
      semimonthly: [238, 238, 476, 476],
      monthly: [476, 476, 951, 951],
      quarterly: [1427, 1427, 2853, 2853],
      semiannual: [2853, 2853, 5706, 5706],
      annual: [5706, 5706, 11412, 11412],
      daily: [22, 22, 44, 44],
    }),

    // Method B Table 4: Exemption Allowance credit (0..10 allowances).
    exemptionAllowance: [
      perPeriod([0, 0, 0, 0, 0, 0, 0, 0]),
      perPeriod([3.24, 6.47, 7.01, 14.03, 42.08, 84.15, 168.3, 0.65]),
      perPeriod([6.47, 12.95, 14.03, 28.05, 84.15, 168.3, 336.6, 1.29]),
      perPeriod([9.71, 19.42, 21.04, 42.08, 126.23, 252.45, 504.9, 1.94]),
      perPeriod([12.95, 25.89, 28.05, 56.1, 168.3, 336.6, 673.2, 2.59]),
      perPeriod([16.18, 32.37, 35.06, 70.13, 210.38, 420.75, 841.5, 3.24]),
      perPeriod([19.42, 38.84, 42.08, 84.15, 252.45, 504.9, 1009.8, 3.88]),
      perPeriod([22.66, 45.31, 49.09, 98.18, 294.53, 589.05, 1178.1, 4.53]),
      perPeriod([25.89, 51.78, 56.1, 112.2, 336.6, 673.2, 1346.4, 5.18]),
      perPeriod([29.13, 58.26, 63.11, 126.23, 378.68, 757.35, 1514.7, 5.83]),
      perPeriod([32.37, 64.73, 70.13, 140.25, 420.75, 841.5, 1683, 6.47]),
    ],

    // Method B Tables 5–28 (generated).
    rateTables: CA_RATE_TABLES_2026 as Record<PayFrequency, Record<CaFilingStatus, CaRateRow[]>>,
  },
}
