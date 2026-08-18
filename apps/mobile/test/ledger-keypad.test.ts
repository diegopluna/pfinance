import { expect, test } from 'vite-plus/test'
import { keypadAmountText, pressDelete, pressDigit, pressDoubleZero } from '../src/ledger/keypad.ts'

// --- The quick-add sheet's cash-register amount (issue #80) ---
// The keypad edits an unsigned integer in minor units directly, so there is
// no decimal separator to place and no parse step that can fail while
// typing; the integer becomes the drafts' unsigned decimal text only at
// submit.

test('digits push in from the right, cash-register style', () => {
  const typed = [2, 4, 7, 9, 0].reduce(pressDigit, 0)
  expect(typed).toBe(24790)
  expect(keypadAmountText(typed, 'BRL')).toBe('247.90')
})

test('double zero is two presses of zero', () => {
  expect(pressDoubleZero(247)).toBe(24700)
})

test('delete pops the last digit and empties back to zero', () => {
  expect(pressDelete(24790)).toBe(2479)
  expect(pressDelete(2)).toBe(0)
  expect(pressDelete(0)).toBe(0)
})

test('an empty keypad reads as unentered, never as zero', () => {
  expect(keypadAmountText(0, 'BRL')).toBe('')
})

test('a zero-exponent currency types whole units', () => {
  const typed = [1, 2, 3, 4].reduce(pressDigit, 0)
  expect(keypadAmountText(typed, 'JPY')).toBe('1234')
})

test('the cap refuses a thirteenth digit instead of overflowing', () => {
  const full = Array.from({ length: 12 }, () => 9).reduce(pressDigit, 0)
  expect(pressDigit(full, 9)).toBe(full)
})
