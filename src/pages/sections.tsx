import { Placeholder } from './Placeholder'

// Section stubs. Each is replaced by a real page as it's built.

export function Overview() {
  return (
    <Placeholder
      purpose="Immediate view of the household's year-end tax position, its drivers, and whether withholding is on track."
      planned={[
        'KPI row: projected refund/due, total liability, total payments, total income, effective rates',
        'Tax liability vs. payments chart with actual/projected cutoff and year-end forecast',
        'Income composition, Federal vs. California, investment P/L, withholding progress',
        'Paycheck summary and recent activity & next steps',
      ]}
    />
  )
}

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

export function Scenarios() {
  return (
    <Placeholder
      purpose="Explore financial choices without changing the baseline forecast."
      planned={[
        'Create a scenario from the current baseline',
        'Override salary, bonus, equity sales, withholding, estimated payments, contributions',
        'Side-by-side baseline vs. scenario with deltas and change trace',
        'Save, duplicate, rename and discard named scenarios',
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
