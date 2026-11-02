import { sum, type Cents } from '../money'
import { EMPTY_BENEFITS, isPaidOut, netPay, sortPaystubs } from '../payroll'
import type { PayrollRecord } from '../types'
import { calculateSalaryPaycheck } from './calculate'
import type { SalaryPaycheckInput } from './types'

/*
 * Applies a new W-4/DE-4 + benefits election to one person's not-yet-Paid-Out
 * paychecks, keeping each paycheck's own gross pay. Social Security and
 * Additional Medicare are capped correctly by walking the year in order,
 * seeding the running FICA-wage total from paychecks already Paid Out.
 */

/** FICA wages for a stored paycheck, matching calculateSalaryPaycheck's formula (calculate.ts). */
function storedFicaWages(record: PayrollRecord): Cents {
  const b = record.benefits ?? EMPTY_BENEFITS
  const section125 = b.medical + b.dental + b.vision + b.healthcareFsa + b.dependentFsa
  return Math.max(0, record.gross - section125 - b.hsa + (record.gtli ?? 0))
}

export interface SimulatedAmounts {
  federal: Cents
  ca: Cents
  socialSecurity: Cents
  medicare: Cents
  sdi: Cents
  net: Cents
}

export interface SimulatedPaycheck {
  record: PayrollRecord
  current: SimulatedAmounts
  simulated: SimulatedAmounts
}

export interface WithholdingSimulation {
  paychecks: SimulatedPaycheck[]
  current: { federal: Cents; ca: Cents }
  simulated: { federal: Cents; ca: Cents }
}

/** The election part of a calculator input: everything except what varies per paycheck. */
export type WithholdingElectionInput = Pick<SalaryPaycheckInput, 'federal' | 'california' | 'benefits'>

export function simulateWithholding(
  records: PayrollRecord[],
  election: WithholdingElectionInput,
  taxYear: number,
): WithholdingSimulation {
  const sorted = sortPaystubs(records)
  let ytdFicaWages = sum(sorted.filter(isPaidOut).map(storedFicaWages))

  const paychecks: SimulatedPaycheck[] = []
  for (const record of sorted) {
    if (isPaidOut(record)) continue
    const result = calculateSalaryPaycheck({
      taxYear,
      payFrequency: 'semimonthly',
      grossPerPeriod: record.gross,
      ytdFicaWages,
      ...election,
    })
    paychecks.push({
      record,
      current: {
        federal: record.federalWithholding,
        ca: record.caWithholding,
        socialSecurity: record.socialSecurity,
        medicare: record.medicare,
        sdi: record.caSdi,
        net: netPay(record),
      },
      simulated: {
        federal: result.withholding.federalIncomeTax,
        ca: result.withholding.californiaIncomeTax,
        socialSecurity: result.withholding.socialSecurity,
        // The record model carries one combined Medicare line; Additional Medicare folds in.
        medicare: result.withholding.medicare + result.withholding.additionalMedicare,
        sdi: result.withholding.californiaSdi,
        net: result.netPay,
      },
    })
    ytdFicaWages += result.wages.fica
  }

  const paidTotals = sorted.filter(isPaidOut).reduce(
    (acc, r) => ({ federal: acc.federal + r.federalWithholding, ca: acc.ca + r.caWithholding }),
    { federal: 0, ca: 0 },
  )
  const currentUnpaidTotals = paychecks.reduce(
    (acc, p) => ({ federal: acc.federal + p.current.federal, ca: acc.ca + p.current.ca }),
    { federal: 0, ca: 0 },
  )
  const simulatedUnpaidTotals = paychecks.reduce(
    (acc, p) => ({ federal: acc.federal + p.simulated.federal, ca: acc.ca + p.simulated.ca }),
    { federal: 0, ca: 0 },
  )

  return {
    paychecks,
    current: { federal: paidTotals.federal + currentUnpaidTotals.federal, ca: paidTotals.ca + currentUnpaidTotals.ca },
    simulated: { federal: paidTotals.federal + simulatedUnpaidTotals.federal, ca: paidTotals.ca + simulatedUnpaidTotals.ca },
  }
}
