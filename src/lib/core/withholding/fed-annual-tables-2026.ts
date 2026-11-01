// Pub 15-T (2026), Percentage Method Tables for Automated Payroll Systems — Annual Percentage Method.
// Dollar amounts as published. Row: wage >= over; tentative annual = base + rate * (wage - over).
// Generated from the IRS PDF; do not hand-edit.

import type { FedRateRow } from './types'

export const FED_ANNUAL_TABLES_2026: Record<'standard' | 'step2Checkbox', Record<'mfj' | 'single' | 'hoh', FedRateRow[]>> = {
  standard: {
    mfj: [
      { over: 0, rate: 0, base: 0 },
      { over: 19300, rate: 0.1, base: 0 },
      { over: 44100, rate: 0.12, base: 2480 },
      { over: 120100, rate: 0.22, base: 11600 },
      { over: 230700, rate: 0.24, base: 35932 },
      { over: 422850, rate: 0.32, base: 82048 },
      { over: 531750, rate: 0.35, base: 116896 },
      { over: 788000, rate: 0.37, base: 206583.5 },
    ],
    single: [
      { over: 0, rate: 0, base: 0 },
      { over: 7500, rate: 0.1, base: 0 },
      { over: 19900, rate: 0.12, base: 1240 },
      { over: 57900, rate: 0.22, base: 5800 },
      { over: 113200, rate: 0.24, base: 17966 },
      { over: 209275, rate: 0.32, base: 41024 },
      { over: 263725, rate: 0.35, base: 58448 },
      { over: 648100, rate: 0.37, base: 192979.25 },
    ],
    hoh: [
      { over: 0, rate: 0, base: 0 },
      { over: 15550, rate: 0.1, base: 0 },
      { over: 33250, rate: 0.12, base: 1770 },
      { over: 83000, rate: 0.22, base: 7740 },
      { over: 121250, rate: 0.24, base: 16155 },
      { over: 217300, rate: 0.32, base: 39207 },
      { over: 271750, rate: 0.35, base: 56631 },
      { over: 656150, rate: 0.37, base: 191171 },
    ],
  },
  step2Checkbox: {
    mfj: [
      { over: 0, rate: 0, base: 0 },
      { over: 16100, rate: 0.1, base: 0 },
      { over: 28500, rate: 0.12, base: 1240 },
      { over: 66500, rate: 0.22, base: 5800 },
      { over: 121800, rate: 0.24, base: 17966 },
      { over: 217875, rate: 0.32, base: 41024 },
      { over: 272325, rate: 0.35, base: 58448 },
      { over: 400450, rate: 0.37, base: 103291.75 },
    ],
    single: [
      { over: 0, rate: 0, base: 0 },
      { over: 8050, rate: 0.1, base: 0 },
      { over: 14250, rate: 0.12, base: 620 },
      { over: 33250, rate: 0.22, base: 2900 },
      { over: 60900, rate: 0.24, base: 8983 },
      { over: 108938, rate: 0.32, base: 20512 },
      { over: 136163, rate: 0.35, base: 29224 },
      { over: 328350, rate: 0.37, base: 96489.63 },
    ],
    hoh: [
      { over: 0, rate: 0, base: 0 },
      { over: 12075, rate: 0.1, base: 0 },
      { over: 20925, rate: 0.12, base: 885 },
      { over: 45800, rate: 0.22, base: 3870 },
      { over: 64925, rate: 0.24, base: 8077.5 },
      { over: 112950, rate: 0.32, base: 19603.5 },
      { over: 140175, rate: 0.35, base: 28315.5 },
      { over: 332375, rate: 0.37, base: 95585.5 },
    ],
  },
}
