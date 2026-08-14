import { expect, test } from 'vite-plus/test'
import { addMonths, monthLabel } from '../src/charts/months.ts'

// --- Month arithmetic on YYYY-MM strings (issue #79) ---
// The chart surfaces step months the way the server does (apps/server/src/
// net-worth.ts): pure integer math on the string, no Date, so no timezone
// can shift a boundary. Expected values are worked examples, including the
// year-wrap cases that break naive month+1 code.

test('addMonths steps within a year', () => {
  expect(addMonths('2026-05', 1)).toBe('2026-06')
  expect(addMonths('2026-05', -2)).toBe('2026-03')
})

test('addMonths wraps year boundaries in both directions', () => {
  expect(addMonths('2026-12', 1)).toBe('2027-01')
  expect(addMonths('2026-01', -1)).toBe('2025-12')
  expect(addMonths('2026-08', -12)).toBe('2025-08')
})

// --- Month labels ---
// `YYYY-MM` → a human month, built and formatted in UTC so the label can
// never land in a neighboring month. Locale is pinned so expectations don't
// depend on the runner's environment; screens pass the device default.

test('monthLabel renders the axis tick and full styles', () => {
  expect(monthLabel('2026-08', 'tick', 'en-US')).toBe('Aug 2026')
  expect(monthLabel('2026-08', 'full', 'en-US')).toBe('August 2026')
})

test('monthLabel bare month style carries no year — the hero delta "vs Jul"', () => {
  expect(monthLabel('2026-07', 'month', 'en-US')).toBe('Jul')
})

test('monthLabel December stays December in UTC', () => {
  expect(monthLabel('2025-12', 'tick', 'en-US')).toBe('Dec 2025')
})
