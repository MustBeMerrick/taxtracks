import type { Cents } from '../lib/money'

// Core domain shapes (spec §5). Phase 4 extends these with persistence
// metadata and the remaining entities.

/** Every significant amount says where it came from (spec §5 Provenance). */
export type Provenance = 'actual' | 'projected' | 'manual_estimate'

export type Jurisdiction = 'federal' | 'ca'

export interface Taxpayer {
  id: string
  name: string
}

export interface PayrollRecord {
  id: string
  taxpayerId: string
  employer: string
  payDate: string // ISO date
  status: Provenance
  gross: Cents
  /** Pre-tax HSA + 401(k) + other pre-tax deductions. */
  preTax: Cents
  federalWithholding: Cents
  caWithholding: Cents
  socialSecurity: Cents
  medicare: Cents
  caSdi: Cents
}

export interface InvestmentSourceSummary {
  id: string
  name: string
  /** Signed: gains positive, losses negative (spec §5 invariants). */
  shortTerm: Cents
  longTerm: Cents
  dividendsInterest: Cents
  status: Provenance
}

export interface OtherIncome {
  id: string
  label: string
  amount: Cents
  status: Provenance
}

/** Income tax liability for a jurisdiction. Comes from the tax engine once it exists. */
export interface LiabilityEstimate {
  jurisdiction: Jurisdiction
  amount: Cents
  status: Provenance
  source: string
}

export interface ActivityItem {
  id: string
  date: string // ISO date
  label: string
  kind: 'done' | 'upcoming' | 'warning'
}
