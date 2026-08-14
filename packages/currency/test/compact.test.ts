import { expect, test } from 'vite-plus/test'
import { compactAmount } from '../src/index.ts'

// --- Compact amounts (issue #79) ---
// The short value form for display-only chart geometry — axis ticks and bar
// tips; exact amounts always render via formatAmount. Fixed English
// suffixes and integer arithmetic, so Hermes' partial Intl support can't
// vary the output between devices and no float ever touches an amount
// (ADR 0006).

test('small amounts render as whole major units', () => {
  expect(compactAmount(23456, 'USD')).toBe('235')
  expect(compactAmount(0, 'USD')).toBe('0')
})

test('thousands and millions abbreviate to one decimal', () => {
  expect(compactAmount(123456, 'USD')).toBe('1.2K')
  expect(compactAmount(345678900, 'USD')).toBe('3.5M')
  expect(compactAmount(1200000000000, 'USD')).toBe('12B')
})

test('a round abbreviation drops the trailing .0', () => {
  expect(compactAmount(1000000, 'USD')).toBe('10K')
})

test('rounding can promote across a threshold', () => {
  // 9999.5 major rounds to 10.0K, which must render 10K, never 10.0K.
  expect(compactAmount(999950, 'USD')).toBe('10K')
  // 999,999.99 major rounds up into the next suffix: 1M, never 1000K.
  expect(compactAmount(99999999, 'USD')).toBe('1M')
  // 999.95 major rounds into the first suffix: 1K, never 1000.
  expect(compactAmount(99995, 'USD')).toBe('1K')
})

test('negative amounts keep their sign — net worth lives below zero too', () => {
  expect(compactAmount(-123456, 'USD')).toBe('-1.2K')
  // ...but an amount that rounds to nothing never renders "-0".
  expect(compactAmount(-40, 'USD')).toBe('0')
})

test('the exponent comes from the Currency, not an assumption of cents', () => {
  expect(compactAmount(1500, 'JPY')).toBe('1.5K')
  expect(compactAmount(1500000, 'BHD')).toBe('1.5K')
})

test('non-integer input is rejected, the package boundary rule', () => {
  expect(() => compactAmount(12.5, 'USD')).toThrow(RangeError)
})
