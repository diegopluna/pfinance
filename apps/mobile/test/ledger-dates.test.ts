import { expect, test } from 'vite-plus/test'
import { formatCalendarDate, isCalendarDate, previousCalendarDay } from '../src/ledger/dates.ts'

// --- Calendar dates under the Household preference (issue #31 on web,
// mirrored for mobile in issue #78) ---
// The ledger's dates are calendar date strings (YYYY-MM-DD, never a
// timestamp — CONTEXT.md); rendering goes through local date parts only, so
// no timezone can shift a day. Locale is pinned for the fixed formats'
// month names; 'system' defers to the device locale.

test('fixed formats pin the day/month/year order', () => {
  expect(formatCalendarDate('2026-08-13', 'dmy', 'en-US')).toBe('13 Aug 2026')
  expect(formatCalendarDate('2026-08-13', 'mdy', 'en-US')).toBe('Aug 13, 2026')
  expect(formatCalendarDate('2026-08-13', 'ymd', 'en-US')).toBe('2026-08-13')
})

test('a malformed date passes through untouched rather than throwing mid-render', () => {
  expect(formatCalendarDate('not-a-date', 'dmy', 'en-US')).toBe('not-a-date')
})

// --- Validation and day arithmetic for the entry form (issue #80) ---
// Mirrors the server's stance (apps/server/src/transactions.ts): structural
// and against the real calendar, without ever constructing a Date, so no
// timezone can shift a boundary.

test('a calendar date must name a real day', () => {
  expect(isCalendarDate('2026-08-13')).toBe(true)
  expect(isCalendarDate('2024-02-29')).toBe(true)
  expect(isCalendarDate('2026-02-29')).toBe(false)
  expect(isCalendarDate('2026-02-30')).toBe(false)
  expect(isCalendarDate('2026-13-01')).toBe(false)
  expect(isCalendarDate('2026-00-10')).toBe(false)
  expect(isCalendarDate('2026-08-00')).toBe(false)
  expect(isCalendarDate('13/08/2026')).toBe(false)
  expect(isCalendarDate('2026-8-13')).toBe(false)
  expect(isCalendarDate('')).toBe(false)
})

test('the previous day rolls over months, years, and leap February', () => {
  expect(previousCalendarDay('2026-08-13')).toBe('2026-08-12')
  expect(previousCalendarDay('2026-08-01')).toBe('2026-07-31')
  expect(previousCalendarDay('2026-01-01')).toBe('2025-12-31')
  expect(previousCalendarDay('2024-03-01')).toBe('2024-02-29')
  expect(previousCalendarDay('2026-03-01')).toBe('2026-02-28')
})
