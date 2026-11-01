'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { savePaystub } from '@/app/actions'
import { Select } from '@/components/ui/controls'
import { handleNumericChange } from '@/components/ui/numeric-input'
import { formatMoney } from '@/lib/core/money'
import { formatPayDate, nextPayDate, semiMonthlyPayDates } from '@/lib/core/pay-dates'
import { benefitsTotal, EMPTY_BENEFITS } from '@/lib/core/payroll'
import type { PaystubInput } from '@/lib/core/paystub-input'
import type { PayrollRecord, PaystubBenefits } from '@/lib/core/types'
import { formatDollars, parseMoney } from '@/lib/core/withholding/form'
import { useScheduleRefresh } from '@/lib/refresh-context'
import '@/components/calculators/calculators.css'
import '@/components/ui/controls.css'

type MoneyKey =
  | 'gross'
  | 'federal'
  | 'socialSecurity'
  | 'medicare'
  | 'ca'
  | 'sdi'
  | 'medical'
  | 'dental'
  | 'vision'
  | 'healthcareFsa'
  | 'dependentFsa'
  | 'hsa'
  | 'retirement401k'
  | 'gtli'
  | 'employerHsa'

interface FormState extends Record<MoneyKey, string> {
  payDate: string
  employer: string
  paidOut: boolean
  notes: string
}

const dollars = (cents: number | undefined) => (cents ? formatDollars((cents / 100).toFixed(2)) : '')

function initialState(record: PayrollRecord | undefined, lastEmployer: string, defaultPayDate: string): FormState {
  const b: PaystubBenefits = record?.benefits ?? EMPTY_BENEFITS
  return {
    payDate: record?.payDate ?? defaultPayDate,
    employer: record?.employer ?? lastEmployer,
    paidOut: record ? record.status === 'actual' : false,
    notes: record?.notes ?? '',
    gross: dollars(record?.gross),
    federal: dollars(record?.federalWithholding),
    socialSecurity: dollars(record?.socialSecurity),
    medicare: dollars(record?.medicare),
    ca: dollars(record?.caWithholding),
    sdi: dollars(record?.caSdi),
    medical: dollars(b.medical),
    dental: dollars(b.dental),
    vision: dollars(b.vision),
    healthcareFsa: dollars(b.healthcareFsa),
    dependentFsa: dollars(b.dependentFsa),
    hsa: dollars(b.hsa),
    // Records that only carry a lump pre-tax total show it as 401(k)/other so nothing is silently dropped.
    retirement401k: dollars(record?.benefits ? b.retirement401k : record?.preTax),
    gtli: dollars(record?.gtli),
    employerHsa: dollars(record?.employerHsa),
  }
}

const MONEY_KEYS: MoneyKey[] = [
  'gross', 'federal', 'socialSecurity', 'medicare', 'ca', 'sdi',
  'medical', 'dental', 'vision', 'healthcareFsa', 'dependentFsa', 'hsa', 'retirement401k', 'gtli', 'employerHsa',
]

export function PaystubDialog({
  year,
  taxpayerId,
  taxpayerName,
  record,
  lastEmployer,
  takenDates,
  onClose,
}: {
  year: number
  taxpayerId: string
  taxpayerName: string
  record?: PayrollRecord
  lastEmployer: string
  /** Pay dates of this person's other paystubs (can't be entered twice). */
  takenDates: string[]
  onClose: () => void
}) {
  const scheduleRefresh = useScheduleRefresh()
  const dialog = useRef<HTMLDialogElement>(null)
  const [form, setForm] = useState<FormState>(() => initialState(record, lastEmployer, nextPayDate(year, [...takenDates].sort().at(-1)) ?? ''))
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const el = dialog.current
    if (el && !el.open) el.showModal()
  }, [])

  // Pay dates are the 15th and the last day of each month (the Friday before when that is a weekend).
  const payDateOptions = [
    ...semiMonthlyPayDates(year).map((date) => ({
      value: date,
      label: `${formatPayDate(date)}${takenDates.includes(date) ? ' — already entered' : ''}`,
    })),
    // An existing paystub keeps a date that isn't on the schedule rather than silently changing it.
    ...(form.payDate && !semiMonthlyPayDates(year).includes(form.payDate)
      ? [{ value: form.payDate, label: `${formatPayDate(form.payDate)} — not a scheduled pay date` }]
      : []),
  ]

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  // Parse everything; field errors only show after the first submit attempt.
  const cents: Record<MoneyKey, number | null> = Object.fromEntries(MONEY_KEYS.map((k) => [k, parseMoney(form[k])])) as Record<MoneyKey, number | null>
  const bad = (k: MoneyKey) => cents[k] === null
  const value = (k: MoneyKey) => cents[k] ?? 0
  const anyBad = MONEY_KEYS.some(bad)

  const benefits: PaystubBenefits = {
    medical: value('medical'),
    dental: value('dental'),
    vision: value('vision'),
    healthcareFsa: value('healthcareFsa'),
    dependentFsa: value('dependentFsa'),
    hsa: value('hsa'),
    retirement401k: value('retirement401k'),
  }
  const preTax = benefitsTotal(benefits)
  const taxes = value('federal') + value('socialSecurity') + value('medicare') + value('ca') + value('sdi')
  const net = value('gross') - preTax - taxes

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setServerError(null)
    if (anyBad) return
    const input: PaystubInput = {
      id: record?.id,
      taxpayerId,
      employer: form.employer,
      payDate: form.payDate,
      paidOut: form.paidOut,
      gross: value('gross'),
      benefits,
      gtli: value('gtli'),
      employerHsa: value('employerHsa'),
      federalWithholding: value('federal'),
      caWithholding: value('ca'),
      socialSecurity: value('socialSecurity'),
      medicare: value('medicare'),
      caSdi: value('sdi'),
      notes: form.notes,
    }
    setSaving(true)
    try {
      const result = await savePaystub(input)
      if (!result.ok) {
        setServerError(result.message)
        return
      }
      scheduleRefresh()
      dialog.current?.close()
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  const field = (key: MoneyKey, label: string, hint?: string): ReactNode => {
    const id = `stub-${key}`
    const showError = submitted && bad(key)
    return (
      <div className="tt-calc-field">
        <label htmlFor={id} className="tt-field-label">
          {label}
        </label>
        <div className={`tt-calc-input ${showError ? 'tt-calc-input--error' : ''}`}>
          <span aria-hidden="true">$</span>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={form[key]}
            aria-invalid={showError ? true : undefined}
            aria-describedby={showError || hint ? `${id}-note` : undefined}
            onChange={(e) => handleNumericChange(e, (v) => set(key, v), 2)}
            onBlur={() => set(key, formatDollars(form[key]))}
          />
        </div>
        {(showError || hint) && (
          <p id={`${id}-note`} className={showError ? 'tt-calc-error' : 'tt-calc-hint'}>
            {showError ? 'Enter a dollar amount' : hint}
          </p>
        )}
      </div>
    )
  }

  return (
    <dialog ref={dialog} className="tt-dialog" aria-labelledby="stub-dialog-title" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <header className="tt-dialog-header">
          <h2 id="stub-dialog-title">
            {record ? 'Edit' : 'Add'} {taxpayerName}’s paystub
          </h2>
          <p className="tt-muted">Copy the numbers from the pay stub, this period column.</p>
        </header>

        <div className="tt-dialog-body">
          <fieldset className="tt-calc-group">
            <legend>Paycheck</legend>
            <div className="tt-stubs-form-grid">
              <Select
                label="Pay date"
                value={form.payDate}
                options={payDateOptions}
                onChange={(v) => set('payDate', v)}
              />
              <div className="tt-calc-field">
                <label htmlFor="stub-employer" className="tt-field-label">
                  Employer
                </label>
                <div className="tt-calc-input">
                  <input id="stub-employer" type="text" value={form.employer} onChange={(e) => set('employer', e.target.value)} />
                </div>
              </div>
              {field('gross', 'Gross pay')}
            </div>
            <label className="tt-calc-check">
              <input type="checkbox" checked={form.paidOut} onChange={(e) => set('paidOut', e.target.checked)} />
              <span>
                <strong>Paid Out</strong>: these numbers are final and reconciled with the actual stub
              </span>
            </label>
          </fieldset>

          <fieldset className="tt-calc-group">
            <legend>Taxes withheld</legend>
            <div className="tt-stubs-form-grid">
              {field('federal', 'Federal income tax')}
              {field('socialSecurity', 'Social Security')}
              {field('medicare', 'Medicare')}
              {field('ca', 'CA state income tax')}
              {field('sdi', 'CA SDI')}
            </div>
          </fieldset>

          <fieldset className="tt-calc-group">
            <legend>Pre-tax deductions</legend>
            <div className="tt-stubs-form-grid">
              {field('medical', 'Medical')}
              {field('dental', 'Dental')}
              {field('vision', 'Vision')}
              {field('healthcareFsa', 'Healthcare FSA')}
              {field('dependentFsa', 'Dependent care FSA')}
              {field('hsa', 'Health savings (HSA)')}
              {field('retirement401k', '401(k) / 403(b)')}
            </div>
          </fieldset>

          <fieldset className="tt-calc-group">
            <legend>Not cash</legend>
            <div className="tt-stubs-form-grid">
              {field('gtli', 'Group-term life (Gtli)', 'From “Other Benefits” on the stub.')}
              {field('employerHsa', 'Employer HSA contribution', 'Not on the stub; counts toward the HSA limit.')}
            </div>
            <div className="tt-calc-field">
              <label htmlFor="stub-notes" className="tt-field-label">
                Notes
              </label>
              <div className="tt-calc-input">
                <input id="stub-notes" type="text" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </div>
            </div>
          </fieldset>

          <p className="tt-stubs-check" aria-live="polite">
            Pre-tax total <strong>{formatMoney(preTax)}</strong> · Taxes <strong>{formatMoney(taxes)}</strong> · Net pay{' '}
            <strong className={net < 0 ? 'tt-stubs-negative' : ''}>{formatMoney(net)}</strong>
            <span className="tt-muted"> (compare with the stub’s Net Pay)</span>
          </p>
          {serverError && <p className="tt-notice tt-notice--error">{serverError}</p>}
        </div>

        <footer className="tt-dialog-footer">
          <button type="button" className="tt-button tt-button--plain" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="tt-button" disabled={saving}>
            {saving ? 'Saving…' : record ? 'Save changes' : 'Add paystub'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
