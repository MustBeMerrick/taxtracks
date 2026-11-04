import { Card, InfoTip } from '@/components/ui/Card'
import { formatMoney, type Cents } from '@/lib/core/money'
import type { IncomeSummary } from '@/lib/core/income-summary'
import type { TaxEstimate } from '@/lib/core/tax-liability'
import '@/components/income/income.css'
import '@/components/paystubs/paystubs.css'

interface Props {
  estimate: TaxEstimate
  summary: IncomeSummary
  /** Income tax withheld from every paystub this year, Paid Out and projected. */
  withheld: { federal: Cents; ca: Cents }
  filingStatusLabel: string
}

type Line = { label: string; federal?: Cents; ca?: Cents; tip?: string; strong?: boolean }

export function TaxEstimateCard({ estimate, summary, withheld, filingStatusLabel }: Props) {
  const f = estimate.federal
  const c = estimate.california
  const fedMethod = summary.federalItemizes ? 'itemized' : 'standard'
  const caMethod = summary.stateDeduction > summary.stateStandardDeduction ? 'itemized' : 'standard'
  const lines: Line[] = [
    {
      label: `Deduction (fed ${fedMethod}, CA ${caMethod})`,
      federal: summary.federalDeduction,
      ca: summary.stateDeduction,
      tip: 'Whichever is larger, itemized or standard, for each return. Federal itemized counts California income tax and SDI withheld (capped); California’s does not.',
    },
    { label: 'Taxable income', federal: f.ordinaryTaxableIncome + f.capitalGainsIncome, ca: c.taxableIncome, tip: 'Federal: ordinary taxable income plus long-term gains. California taxes gains as ordinary income.' },
    { label: 'Tax on ordinary income', federal: f.ordinaryTax, ca: c.tax, tip: 'Federal 2026 brackets; California FTB 2026 rate schedule, including the 1% mental health tax over $1 million.' },
    { label: 'Tax on long-term gains', federal: f.capitalGainsTax, tip: '0% / 15% / 20% bands stacked on top of ordinary taxable income.' },
    { label: 'Net investment income tax', federal: f.niit, tip: '3.8% of the smaller of net investment income and AGI over $250,000 (married filing jointly).' },
    { label: 'Additional Medicare tax', federal: f.additionalMedicare, tip: '0.9% of combined Medicare wages over $250,000, less what each employer already withheld over $200,000.' },
    { label: 'Exemption credit', ca: -c.exemptionCredit, tip: 'California personal exemption credit, $158 per person for 2026.' },
    { label: 'Estimated tax', federal: f.total, ca: c.total, strong: true },
    { label: 'Withheld (all paystubs)', federal: withheld.federal, ca: withheld.ca, tip: 'Income tax withheld on every paystub this year, Paid Out and projected. Social Security, Medicare and SDI are not income tax.' },
  ]
  const refund = { federal: withheld.federal - f.total, ca: withheld.ca - c.total }

  return (
    <Card title="Estimated tax">
      <p className="tt-stubs-lead">
        Household estimate, {filingStatusLabel}, from the taxable income above. Estimates only: no credits, AMT or other taxes, and dividends
        are taxed as ordinary income until qualified dividends are tracked.
      </p>
      <div className="tt-income-calc-scroll">
        <div className="tt-income-calc-frame">
          <table className="tt-stubs-table tt-income-calc">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Federal</th>
                <th scope="col">California</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.label} className={line.strong ? 'tt-income-strong' : undefined}>
                  <th scope="row">
                    {line.label}
                    {line.tip && <InfoTip text={line.tip} />}
                  </th>
                  <td className="tt-stubs-num">{line.federal === undefined ? '—' : formatMoney(line.federal)}</td>
                  <td className="tt-stubs-num">{line.ca === undefined ? '—' : formatMoney(line.ca)}</td>
                </tr>
              ))}
              <tr className="tt-income-strong">
                <th scope="row">
                  Refund / (amount due)
                  <InfoTip text="Withheld minus estimated tax. Positive is a refund; negative is what you would owe at filing, before any estimated payments." />
                </th>
                <td className={`tt-stubs-num ${refund.federal < 0 ? 'tt-stubs-negative' : ''}`}>{formatMoney(refund.federal)}</td>
                <td className={`tt-stubs-num ${refund.ca < 0 ? 'tt-stubs-negative' : ''}`}>{formatMoney(refund.ca)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}
