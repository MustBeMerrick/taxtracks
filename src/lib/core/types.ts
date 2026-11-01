import type { FilingStatus } from '@/lib/core/filing-status'
import type { Cents } from '@/lib/core/money'

// Domain entities (spec §5). Events and rules are modelled explicitly;
// dashboard totals are always derived, never stored.

/** Every significant amount says where it came from (spec §5 Provenance). */
export type Provenance = 'actual' | 'projected' | 'manual_estimate'

export type Jurisdiction = 'federal' | 'ca'

/** ISO date, YYYY-MM-DD. */
export type IsoDate = string
/** ISO timestamp. */
export type IsoDateTime = string

/** Bookkeeping carried by every stored record. */
export interface RecordMeta {
  id: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  /** Free-text reference: document, statement, import file. */
  source?: string
  notes?: string
}

export interface Household extends RecordMeta {
  name: string
  /** True for the bundled demo data, so it can be cleared wholesale. */
  isSample?: boolean
}

export interface Taxpayer extends RecordMeta {
  householdId: string
  name: string
}

export interface TaxYear extends RecordMeta {
  householdId: string
  year: number
  filingStatus: FilingStatus
  jurisdictions: Jurisdiction[]
}

export type IncomeSourceKind = 'employer' | 'brokerage' | 'bank' | 'other'

export interface IncomeSource extends RecordMeta {
  householdId: string
  name: string
  kind: IncomeSourceKind
  /** Taxpayer id, or 'joint'. */
  owner: string
}

export interface PayrollRecord extends RecordMeta {
  taxYear: number
  taxpayerId: string
  employer: string
  payDate: IsoDate
  status: Provenance
  gross: Cents
  /** Pre-tax HSA + 401(k) + other pre-tax deductions. Equals the sum of `benefits` when that is present. */
  preTax: Cents
  federalWithholding: Cents
  caWithholding: Cents
  socialSecurity: Cents
  medicare: Cents
  caSdi: Cents
  /** Line-item pre-tax deductions as printed on the stub (absent on records that only carry a total). */
  benefits?: PaystubBenefits
  /** Group-term life imputed income ("Gtli"): taxable wages, not cash. */
  gtli?: Cents
  /** Employer HSA contribution: not on the stub, counts toward the HSA limit and California wages. */
  employerHsa?: Cents
}

/** Pre-tax deductions by line, per paycheck. */
export interface PaystubBenefits {
  medical: Cents
  dental: Cents
  vision: Cents
  healthcareFsa: Cents
  dependentFsa: Cents
  hsa: Cents
  retirement401k: Cents
}

/** Per-source investment totals until transaction-level ledgers exist. */
export interface InvestmentSourceSummary extends RecordMeta {
  taxYear: number
  name: string
  /** Signed: gains positive, losses negative (spec §5 invariants). */
  shortTerm: Cents
  longTerm: Cents
  dividendsInterest: Cents
  status: Provenance
}

export interface InvestmentTransaction extends RecordMeta {
  taxYear: number
  sourceId: string
  owner: string
  security: string
  acquired?: IsoDate
  disposed: IsoDate
  proceeds: Cents
  basis: Cents
  fees: Cents
  term: 'short' | 'long'
  status: Provenance
}

export interface OtherIncome extends RecordMeta {
  taxYear: number
  label: string
  owner: string
  amount: Cents
  status: Provenance
}

/** Income-tax liability for a jurisdiction. Hand-entered until the tax engine produces it. */
export interface LiabilityEstimate extends RecordMeta {
  taxYear: number
  jurisdiction: Jurisdiction
  amount: Cents
  status: Provenance
}

export interface WithholdingElection extends RecordMeta {
  taxpayerId: string
  jurisdiction: Jurisdiction
  /** Applies to paychecks on or after this date; history is never rewritten. */
  effectiveDate: IsoDate
  /** W-4 or DE-4 fields; shape firmed up with the calculators. */
  fields: Record<string, string | number | boolean>
}

export interface TaxPayment extends RecordMeta {
  taxYear: number
  jurisdiction: Jurisdiction
  date: IsoDate
  amount: Cents
  kind: 'estimated' | 'extension' | 'other'
  status: Provenance
}

export interface Deduction extends RecordMeta {
  taxYear: number
  owner: string
  category: string
  amount: Cents
  status: Provenance
}

export interface Carryover extends RecordMeta {
  /** The year the carryover is applied in. */
  taxYear: number
  jurisdiction: Jurisdiction
  kind: 'capital_loss_short' | 'capital_loss_long' | 'other'
  amount: Cents
}

export interface ForecastAssumption extends RecordMeta {
  name: string
  scope: string
  value: string | number
  effectiveFrom?: IsoDate
  effectiveTo?: IsoDate
}

/** A saved snapshot of calculated results, reproducible from its inputs (spec §5). */
export interface CalculationRun extends RecordMeta {
  taxYear: number
  ranAt: IsoDateTime
  inputsHash: string
  rulesVersion: string
  outputs: {
    liability: { federal: Cents; ca: Cents }
    payments: { federal: Cents; ca: Cents }
    refund: { federal: Cents; ca: Cents }
  }
}

export type AuditAction = 'create' | 'update' | 'delete' | 'import' | 'recalculate' | 'reset'

export interface AuditEvent extends RecordMeta {
  at: IsoDateTime
  actor: string
  action: AuditAction
  entity: string
  entityId?: string
  summary: string
}

/** User-facing timeline entries: completed work, upcoming dates, warnings. */
export interface ActivityItem extends RecordMeta {
  date: IsoDate
  label: string
  kind: 'done' | 'upcoming' | 'warning'
}
