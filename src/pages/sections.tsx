import { Placeholder } from './Placeholder'

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

export function Payroll() {
  return (
    <Placeholder
      purpose="Per-paycheck records, year-to-date totals, full-year projections and withholding configuration."
      planned={[
        'Paycheck ledger with actual vs. projected status and line-level drill-down',
        'YTD and projected full-year totals by person and household',
        'Versioned W-4 / DE-4 elections with effective dates',
        'Expected vs. actual withholding comparison',
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

export function Calculators() {
  return (
    <Placeholder
      purpose="Work out withholding changes before submitting a new W-4 or DE-4, using your actual paychecks and projected liability."
      planned={[
        'Federal W-4: per-paycheck withholding via IRS Pub 15-T for the tax year and pay frequency, with each step shown',
        'California DE-4: Method B withholding with allowances and additional amount',
        'Extra withholding per remaining paycheck needed to reach a target refund or zero balance due',
        'Bonus / supplemental pay withholding (flat-rate vs. aggregate)',
        'Estimated tax payment amounts and safe-harbor check',
        'Compare expected vs. actual withholding on recorded paychecks',
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

export function SettingsPage() {
  return (
    <Placeholder
      purpose="Maintain tax context, data sources, rules, preferences and backups."
      planned={[
        'Tax years, filing statuses, taxpayers and household',
        'Employers, brokers, accounts, salary and pay frequency',
        'Tax-rule versions, carryovers and opening balances',
        'Theme and formatting preferences; import, export and backups',
      ]}
    />
  )
}

export function NotFound() {
  return <Placeholder purpose="This page doesn't exist." planned={['Use the navigation to pick a section.']} />
}
