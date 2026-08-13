import { expect, test } from 'vite-plus/test'
import { formatCalendarDate } from '../src/ledger/dates.ts'

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
