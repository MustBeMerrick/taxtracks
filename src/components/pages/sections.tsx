import { Placeholder } from '@/components/pages/Placeholder'

// Section stubs. Each is replaced by a real page as it's built.

export function Income() {
  return (
    <Placeholder
      purpose="Centralized ledger of income and investment tax events, replacing per-broker worksheets."
      planned={[
        'Income summary by taxpayer and category',
        'Sources and accounts (employers, brokers)',
        'Filterable transaction ledger with ST/LT gain/loss, dividends and interest',
        'Estimated vs. confirmed status and reconciliation; CSV import/export',
      ]}
    />
  )
}

export function TaxEngine() {
  return (
    <Placeholder
      purpose="Transparent, auditable federal and California calculations."
      planned={[
        'Federal / California selector with rules version and filing status',
        'Expandable calculation tree from wages to refund/due',
        'Per-node inputs, formula, intermediate values, rounding and rule source',
        'Bracket, LTCG threshold and deduction tables by tax year',
      ]}
    />
  )
}

export function Reports() {
  return (
    <Placeholder
      purpose="Historical and exportable summaries (optional for the first release)."
      planned={[
        'Tax-year comparisons and income-source breakdowns',
        'Withholding and forecast accuracy over time',
        'Printable annual summary and calculation report',
        'CSV export of ledgers and audit trail',
      ]}
    />
  )
}

