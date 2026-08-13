import { expect, test } from 'vite-plus/test'
import { compactAmount } from '../src/charts/compact.ts'

// --- Compact axis labels (issue #79) ---
// The short value form for display-only chart geometry — axis ticks and bar
// tips; exact amounts always render via formatAmount. Unlike the web's
// Intl-compact version (apps/web/src/lib/format.ts), this one is pure
// string-free math so Hermes' partial Intl support can't vary the output
// between devices. The minor→major conversion reads the exponent from the
// shared currency package (ADR 0006) — the one float division here never
// touches a ledger amount that is kept.

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
})

test('zero-exponent currencies count their minor units as major', () => {
  expect(compactAmount(1500, 'JPY')).toBe('1.5K')
})
