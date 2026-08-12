import { expect, test } from 'vite-plus/test'
import { formatCalendarDate, parseCalendarDate, toCalendarString } from '../src/lib/dates.ts'

// Calendar date strings round-trip through local date parts only — no
// UTC parsing that could shift a day west of Greenwich (CONTEXT.md:
// Transactions carry calendar dates, never timestamps).

test('calendar strings round-trip through Date without timezone drift', () => {
  const date = parseCalendarDate('2025-12-31')
  expect(date).toBeDefined()
  expect(toCalendarString(date as Date)).toBe('2025-12-31')
  // First of the month is the drift-prone case: UTC parsing would render
  // Dec 31 anywhere west of Greenwich.
  expect(toCalendarString(parseCalendarDate('2026-01-01') as Date)).toBe('2026-01-01')
})

// The fixed formats pin day/month/year order; the month name follows the
// given locale (in the app, the browser's — locale is pinned here so the
// suite passes on any machine, the formatAmount test pattern).

test('dmy and mdy pin the order around a localized month name', () => {
  expect(formatCalendarDate('2025-12-31', 'dmy', 'en-US')).toBe('31 Dec 2025')
  expect(formatCalendarDate('2025-12-31', 'mdy', 'en-US')).toBe('Dec 31, 2025')
  expect(formatCalendarDate('2025-12-31', 'dmy', 'pt-BR')).toBe('31 dez. 2025')
})

test('ymd renders the calendar string itself', () => {
  expect(formatCalendarDate('2025-12-31', 'ymd')).toBe('2025-12-31')
  // Even via a locale that would otherwise reorder or rename parts.
  expect(formatCalendarDate('2025-06-07', 'ymd', 'pt-BR')).toBe('2025-06-07')
})

test('system defers to the locale default (the pre-preference rendering)', () => {
  expect(formatCalendarDate('2025-12-31', 'system', 'en-US')).toBe('Dec 31, 2025')
  expect(formatCalendarDate('2025-12-31', 'system', 'en-GB')).toBe('31 Dec 2025')
})

test('a malformed date string passes through untouched instead of throwing', () => {
  expect(formatCalendarDate('not-a-date', 'dmy')).toBe('not-a-date')
  expect(formatCalendarDate('', 'system')).toBe('')
})
