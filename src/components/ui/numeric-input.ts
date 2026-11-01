import type { ChangeEvent } from 'react'
import { formatNumberInput } from '@/lib/core/withholding/form'

/**
 * onChange handler for text inputs holding numbers: groups digits with commas as you type and keeps the
 * caret before the same trailing digits/decimal point (counting from the end is robust to commas and an
 * auto-added leading zero).
 */
export function handleNumericChange(e: ChangeEvent<HTMLInputElement>, setValue: (formatted: string) => void, maxDecimals?: number) {
  const input = e.target
  const charsAfterCaret = input.value.slice(input.selectionStart ?? input.value.length).replace(/[^\d.]/g, '').length
  const formatted = formatNumberInput(input.value, maxDecimals)
  setValue(formatted)
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
}
