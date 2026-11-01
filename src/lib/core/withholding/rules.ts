import { RULES_2026 } from './rules-2026'
import type { WithholdingRules } from './types'

const RULES_BY_YEAR: Record<number, WithholdingRules> = {
  2026: RULES_2026,
}

export const SUPPORTED_TAX_YEARS: number[] = Object.keys(RULES_BY_YEAR).map(Number)

export class UnsupportedTaxYearError extends Error {
  constructor(public readonly taxYear: number) {
    super(`No withholding rules for tax year ${taxYear} (supported: ${SUPPORTED_TAX_YEARS.join(', ')})`)
  }
}

export function getWithholdingRules(taxYear: number): WithholdingRules {
  const rules = RULES_BY_YEAR[taxYear]
  if (!rules) throw new UnsupportedTaxYearError(taxYear)
  return rules
}
