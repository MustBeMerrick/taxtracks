'use client'

import { ChevronRight, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { Segmented, Select } from '@/components/ui/controls'
import { formatMoney, formatPercent } from '@/lib/core/money'
import { calculateSalaryPaycheck } from '@/lib/core/withholding/calculate'
import { defaultForm, formatDollars, formatNumberInput, formToInput, type FormErrors, type PaycheckForm } from '@/lib/core/withholding/form'
import { SUPPORTED_TAX_YEARS, UnsupportedTaxYearError } from '@/lib/core/withholding/rules'
import {
  PAY_FREQUENCIES,
  PAY_FREQUENCY_LABELS,
  type SalaryPaycheckInput,
  type SalaryPaycheckResult,
  type TraceLine,
} from '@/lib/core/withholding/types'
import '@/components/calculators/calculators.css'

type Tab = 'earnings' | 'federal' | 'state' | 'benefits'

const TABS: { value: Tab; label: string }[] = [
  { value: 'earnings', label: 'Earnings' },
  { value: 'federal', label: 'Federal' },
  { value: 'state', label: 'California' },
  { value: 'benefits', label: 'Benefits' },
]

const STORAGE_KEY = 'taxtracks.salary-paycheck-form.v1'

export function SalaryPaycheckCalculator({ today }: { today: string }) {
  const [form, setForm] = useState<PaycheckForm>(() => defaultForm(today))
  const [tab, setTab] = useState<Tab>('earnings')

  // Per-viewer convenience: remember the last inputs in this browser. Never required.
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore after hydration
      if (saved) setForm({ ...defaultForm(today), ...JSON.parse(saved), payDate: today })
    } catch {
      /* storage blocked or corrupt: start fresh */
    }
    // The server's date can be a day off from the viewer's; the pay date defaults to the local day.
    setForm((f) => ({ ...f, payDate: new Date().toLocaleDateString('en-CA') }))
    setRestored(true)
  }, [today])
  useEffect(() => {
    if (!restored) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...form, payDate: undefined }))
    } catch {
      /* ignore */
    }
  }, [form, restored])

  const set = <K extends keyof PaycheckForm>(key: K, value: PaycheckForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  const parsed = useMemo(() => formToInput(form), [form])
  const outcome = useMemo(() => {
    if (!parsed.ok) return { kind: 'invalid' as const }
    try {
      return { kind: 'ok' as const, input: parsed.input, result: calculateSalaryPaycheck(parsed.input) }
    } catch (err) {
      if (err instanceof UnsupportedTaxYearError) return { kind: 'year' as const, taxYear: err.taxYear }
      throw err
    }
  }, [parsed])

  const errors = parsed.errors
  const fields = { form, set, errors }

  return (
    <div className="tt-calc">
      <Card className="tt-calc-form">
        <div className="tt-calc-tabs" role="tablist" aria-label="Calculator sections">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              id={`calc-tab-${t.value}`}
              aria-selected={tab === t.value}
              aria-controls="calc-panel"
              onClick={() => setTab(t.value)}
            >
              {t.label}
              {tabHasError(t.value, errors) && <span className="tt-calc-dot" role="img" aria-label="has an error" />}
            </button>
          ))}
        </div>

        <div id="calc-panel" role="tabpanel" aria-labelledby={`calc-tab-${tab}`} className="tt-calc-panel">
          {tab === 'earnings' && <EarningsTab {...fields} />}
          {tab === 'federal' && <FederalTab {...fields} />}
          {tab === 'state' && <StateTab {...fields} />}
          {tab === 'benefits' && <BenefitsTab {...fields} />}
        </div>

        <button type="button" className="tt-button tt-button--plain tt-calc-reset" onClick={() => setForm(defaultForm(today))}>
          <RotateCcw size={16} aria-hidden="true" /> Reset
        </button>
      </Card>

      <div className="tt-calc-results">
        {outcome.kind === 'ok' && <Results result={outcome.result} input={outcome.input} frequency={form.payFrequency} />}
        {outcome.kind === 'year' && (
          <Card title="No rules for this year">
            <p className="tt-calc-note">
              There are no withholding tables for tax year {outcome.taxYear}. Supported: {SUPPORTED_TAX_YEARS.join(', ')}.
              Change the pay date on the Earnings tab.
            </p>
          </Card>
        )}
        {outcome.kind === 'invalid' && (
          <Card title="Check your entries">
            <p className="tt-calc-note">Fix the highlighted fields to see the paycheck.</p>
          </Card>
        )}
      </div>
    </div>
  )
}

function tabHasError(tab: Tab, errors: FormErrors): boolean {
  const keys = Object.keys(errors)
  const groups: Record<Tab, (k: string) => boolean> = {
    earnings: (k) => ['salary', 'payDate', 'ytdFicaWages'].includes(k),
    federal: (k) => k.startsWith('step'),
    state: (k) => k.startsWith('ca'),
    benefits: (k) =>
      ['medical', 'dental', 'vision', 'healthcareFsa', 'dependentFsa', 'hsa', 'hsaEmployer', 'gtli', 'retirement'].includes(k),
  }
  return keys.some(groups[tab])
}

// ── Fields ──────────────────────────────────────────────────────────────────────────────

interface TabProps {
  form: PaycheckForm
  set: <K extends keyof PaycheckForm>(key: K, value: PaycheckForm[K]) => void
  errors: FormErrors
}

interface TextFieldProps extends TabProps {
  name: keyof PaycheckForm
  label: string
  hint?: string
  prefix?: string
  suffix?: string
  inputMode?: 'decimal' | 'numeric'
}

function TextField({ form, set, errors, name, label, hint, prefix, suffix, inputMode = 'decimal' }: TextFieldProps) {
  const id = `calc-${name}`
  const error = errors[name]
  return (
    <div className="tt-calc-field">
      <label htmlFor={id} className="tt-field-label">
        {label}
      </label>
      <div className={`tt-calc-input ${error ? 'tt-calc-input--error' : ''}`}>
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          placeholder={prefix === '$' ? '0.00' : '0'}
          value={form[name] as string}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          onBlur={() => {
            if (prefix === '$') set(name, formatDollars(form[name] as string) as never)
          }}
          onChange={(e) => {
            // Re-group digits as the user types, keeping the caret before the same trailing digits/point
            // (counting from the end is robust to commas and an auto-added leading zero).
            const input = e.target
            const charsAfterCaret = input.value.slice(input.selectionStart ?? input.value.length).replace(/[^\d.]/g, '').length
            const formatted = formatNumberInput(input.value, prefix === '$' ? 2 : undefined)
            set(name, formatted as never)
            requestAnimationFrame(() => {
              let seen = 0
              let caret = 0
              for (let i = formatted.length; i > 0; i--) {
                if (seen === charsAfterCaret) {
                  caret = i
                  break
                }
                if (/[\d.]/.test(formatted[i - 1])) seen++
              }
              if (charsAfterCaret === 0) caret = formatted.length
              input.setSelectionRange(caret, caret)
            })
          }}
        />
        {suffix && <span aria-hidden="true">{suffix}</span>}
      </div>
      {(error || hint) && (
        <p id={`${id}-note`} className={error ? 'tt-calc-error' : 'tt-calc-hint'}>
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

function Money(props: Omit<TextFieldProps, 'prefix'>) {
  return <TextField {...props} prefix="$" />
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="tt-calc-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="tt-calc-group">
      <legend>{title}</legend>
      {children}
    </fieldset>
  )
}

// ── Tabs ────────────────────────────────────────────────────────────────────────────────

function EarningsTab(p: TabProps) {
  const { form, set, errors } = p
  return (
    <>
      <Group title="How often are you paid?">
        <Select
          label="Pay frequency"
          value={form.payFrequency}
          options={PAY_FREQUENCIES.map((f) => ({ value: f, label: PAY_FREQUENCY_LABELS[f] }))}
          onChange={(v) => set('payFrequency', v)}
        />
      </Group>
      <Group title="Salary">
        <Segmented
          label="Salary entered as"
          value={form.payMethod}
          options={[
            { value: 'perYear', label: 'Per year' },
            { value: 'perPaycheck', label: 'Per paycheck' },
          ]}
          onChange={(v) => set('payMethod', v)}
        />
        <Money {...p} name="salary" label={form.payMethod === 'perYear' ? 'Annual salary' : 'Gross pay per paycheck'} />
      </Group>
      <Group title="Paycheck">
        <div className="tt-calc-field">
          <label htmlFor="calc-payDate" className="tt-field-label">
            Pay date
          </label>
          <input
            id="calc-payDate"
            type="date"
            className={`tt-calc-date ${errors.payDate ? 'tt-calc-input--error' : ''}`}
            value={form.payDate}
            onChange={(e) => set('payDate', e.target.value)}
          />
          <p className="tt-calc-hint">Its year picks the tax tables.</p>
        </div>
        <Money
          {...p}
          name="ytdFicaWages"
          label="Social Security / Medicare wages paid so far this year"
          hint="Before this paycheck. Needed for the Social Security cap and the 0.9% Additional Medicare tax. To estimate it, divide your latest year-to-date Social Security tax by 0.062."
        />
      </Group>
    </>
  )
}

function FederalTab(p: TabProps) {
  const { form, set } = p
  return (
    <>
      <Group title="Form W-4 (2020 or later)">
        <Select
          label="Filing status (Step 1c)"
          value={form.fedFilingStatus}
          options={[
            { value: 'single', label: 'Single or Married filing separately' },
            { value: 'mfj', label: 'Married filing jointly' },
            { value: 'hoh', label: 'Head of household' },
          ]}
          onChange={(v) => set('fedFilingStatus', v)}
        />
        <Check checked={form.multipleJobs} onChange={(v) => set('multipleJobs', v)}>
          Step 2(c) box checked: two jobs, or spouse also works
        </Check>
        <Money {...p} name="step3Credits" label="Step 3: dependents and other credits (per year)" />
        <Money {...p} name="step4aOtherIncome" label="Step 4(a): other income (per year)" />
        <Money {...p} name="step4bDeductions" label="Step 4(b): deductions (per year)" />
        <Money {...p} name="step4cExtra" label="Step 4(c): extra withholding (per paycheck)" />
      </Group>
      <Group title="Exemptions">
        <Check checked={form.exemptFederal} onChange={(v) => set('exemptFederal', v)}>
          Exempt from federal income tax withholding
        </Check>
        <Check checked={form.exemptSocialSecurity} onChange={(v) => set('exemptSocialSecurity', v)}>
          Exempt from Social Security tax
        </Check>
        <Check checked={form.exemptMedicare} onChange={(v) => set('exemptMedicare', v)}>
          Exempt from Medicare tax
        </Check>
      </Group>
    </>
  )
}

function StateTab(p: TabProps) {
  const { form, set } = p
  return (
    <>
      <Group title="California DE 4">
        <Select
          label="Filing status"
          value={form.caFilingStatus}
          options={[
            { value: 'single', label: 'Single, or married with two or more incomes' },
            { value: 'married', label: 'Married (one income)' },
            { value: 'hoh', label: 'Head of household' },
          ]}
          onChange={(v) => set('caFilingStatus', v)}
        />
        <TextField {...p} name="caRegularAllowances" label="Regular allowances (line 1)" inputMode="numeric" />
        <TextField
          {...p}
          name="caEstimatedAllowances"
          label="Allowances for estimated deductions (line 2)"
          inputMode="numeric"
        />
        <Money {...p} name="caAdditional" label="Additional withholding (per paycheck)" />
      </Group>
      <Group title="Exemptions">
        <Check checked={form.exemptCaIncomeTax} onChange={(v) => set('exemptCaIncomeTax', v)}>
          Exempt from California income tax withholding
        </Check>
        <Check checked={form.exemptSdi} onChange={(v) => set('exemptSdi', v)}>
          Exempt from State Disability Insurance (SDI)
        </Check>
      </Group>
    </>
  )
}

function BenefitsTab(p: TabProps) {
  const { form, set } = p
  return (
    <>
      <Group title="Pre-tax benefits (per paycheck)">
        <Money {...p} name="medical" label="Medical" />
        <Money {...p} name="dental" label="Dental" />
        <Money {...p} name="vision" label="Vision" />
        <Money {...p} name="healthcareFsa" label="Healthcare FSA" />
        <Money {...p} name="dependentFsa" label="Dependent care FSA" />
        <Money
          {...p}
          name="hsa"
          label="Health savings account (HSA)"
          hint="Pre-tax federally and for FICA, but California taxes it."
        />
      </Group>
      <Group title="Retirement">
        <Segmented
          label="401(k) entered as"
          value={form.retirementType}
          options={[
            { value: 'percent', label: 'Percent of pay' },
            { value: 'amount', label: 'Dollar amount' },
          ]}
          onChange={(v) => set('retirementType', v)}
        />
        {form.retirementType === 'percent' ? (
          <TextField {...p} name="retirement" label="Traditional 401(k) / 403(b)" suffix="%" />
        ) : (
          <Money {...p} name="retirement" label="Traditional 401(k) / 403(b) (per paycheck)" />
        )}
      </Group>
      <Group title="Taxable benefits that aren’t cash (per paycheck)">
        <Money
          {...p}
          name="gtli"
          label="Group-term life imputed income"
          hint="Shown as “Gtli” on a pay stub. Adds to federal, Social Security, Medicare and CA income-tax wages, not SDI."
        />
        <Money
          {...p}
          name="hsaEmployer"
          label="Employer HSA contribution"
          hint="Not federal wages, but California taxes it (income tax and SDI)."
        />
      </Group>
    </>
  )
}

// ── Results ─────────────────────────────────────────────────────────────────────────────

function Results({
  result,
  input,
  frequency,
}: {
  result: SalaryPaycheckResult
  input: SalaryPaycheckInput
  frequency: keyof typeof PAY_FREQUENCY_LABELS
}) {
  const w = result.withholding
  const taxRows: [string, number][] = [
    ['Federal income tax', w.federalIncomeTax],
    ['Social Security', w.socialSecurity],
    ['Medicare', w.medicare],
    ['Additional Medicare', w.additionalMedicare],
    ['California income tax', w.californiaIncomeTax],
    ['California SDI', w.californiaSdi],
  ]
  const b = input.benefits
  const benefitRows: [string, number][] = [
    ['Medical', b.medical],
    ['Dental', b.dental],
    ['Vision', b.vision],
    ['Healthcare FSA', b.healthcareFsa],
    ['Dependent care FSA', b.dependentFsa],
    ['HSA', b.hsa],
    ['401(k) / 403(b)', b.retirementPreTax],
  ]

  return (
    <>
      <Card title={`Take-home · ${PAY_FREQUENCY_LABELS[frequency].toLowerCase()}`}>
        <div className="tt-calc-summary">
          <Donut gross={result.gross} taxes={result.totalTaxes} benefits={result.benefitDeductions} net={result.netPay} />
          <div className="tt-calc-totals">
            <TotalLine label="Earnings" value={result.gross} />
            <BreakdownLine label="Taxes" value={-result.totalTaxes} swatch="var(--series-2)" items={taxRows} />
            <BreakdownLine label="Benefits" value={-result.benefitDeductions} swatch="var(--series-3)" items={benefitRows} />
            <TotalLine label="Take-home" value={result.netPay} swatch="var(--series-1)" strong />
          </div>
        </div>
        <div className="tt-calc-notes">
          {result.gross > 0 && (
            <p className="tt-calc-line">
              <span>Effective rate (of gross)</span>
              <span>{formatPercent(result.totalTaxes / result.gross)}</span>
            </p>
          )}
          <p>Wages</p>
          <ul>
            {(
              [
                ['Federal', result.wages.federal],
                ['FICA', result.wages.fica],
                ['California', result.wages.californiaIncomeTax],
                ['SDI', result.wages.sdi],
              ] as const
            ).map(([label, value]) => (
              <li key={label} className="tt-calc-line">
                <span>{label}</span>
                <span>{formatMoney(value)}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <Card title="How it was calculated">
        <div className="tt-calc-trace">
          {result.trace.map((section) => (
            <details key={section.title}>
              <summary>
                <ChevronRight size={16} className="tt-calc-chevron" aria-hidden="true" />
                {section.title}
              </summary>
              <p className="tt-calc-hint">{section.source}</p>
              <table>
                <tbody>
                  {section.lines.map((line, i) => (
                    <tr key={i}>
                      <th scope="row">{line.ref}</th>
                      <td>{line.label}</td>
                      <td className="tt-calc-num">{formatTrace(line)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
        </div>
      </Card>
    </>
  )
}

function formatTrace(line: TraceLine): string {
  if (line.kind === 'money') return formatMoney(line.value)
  if (line.kind === 'rate') return formatPercent(line.value, line.value * 1000 === Math.round(line.value * 1000) ? 1 : 2)
  return String(line.value)
}

function TotalLine({ label, value, swatch, strong }: { label: string; value: number; swatch?: string; strong?: boolean }) {
  return (
    <div className={`tt-calc-row ${strong ? 'tt-calc-row--strong' : ''}`}>
      <span className="tt-calc-label">
        {swatch && <span className="tt-calc-swatch" style={{ background: swatch }} aria-hidden="true" />}
        {label}
      </span>
      <span className="tt-calc-value">{formatMoney(value)}</span>
    </div>
  )
}

/** A total with the items that add up to it listed underneath (zero items hidden). */
function BreakdownLine({ label, value, swatch, items }: { label: string; value: number; swatch: string; items: [string, number][] }) {
  const shown = items.filter(([, amount]) => amount !== 0)
  return (
    <div className="tt-calc-breakdown">
      <TotalLine label={label} value={value} swatch={swatch} />
      <ul className="tt-calc-expand-items">
        {shown.length === 0 && <li className="tt-calc-expand-none">None</li>}
        {shown.map(([name, amount]) => (
          <li key={name}>
            <span>{name}</span>
            <span className="tt-calc-value">{formatMoney(-amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Take-home vs. taxes vs. benefits, as shares of earnings. */
function Donut({ gross, taxes, benefits, net }: { gross: number; taxes: number; benefits: number; net: number }) {
  const size = 150
  const stroke = 22
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const segments = gross > 0
    ? [
        { value: net, color: 'var(--series-1)' },
        { value: taxes, color: 'var(--series-2)' },
        { value: benefits, color: 'var(--series-3)' },
      ]
    : []
  let offset = 0
  return (
    <svg
      className="tt-calc-donut"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Take-home ${formatMoney(net)} of ${formatMoney(gross)} earned`}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-inset)" strokeWidth={stroke} />
      {segments.map((s, i) => {
        const length = Math.max(0, (s.value / gross) * circumference)
        const el = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )
        offset += length
        return el
      })}
      <text x="50%" y="46%" textAnchor="middle" className="tt-calc-donut-label">
        Take-home
      </text>
      <text x="50%" y="60%" textAnchor="middle" className="tt-calc-donut-value">
        {formatMoney(net, { precision: 'whole' })}
      </text>
    </svg>
  )
}
