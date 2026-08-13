import { expect, test } from 'vite-plus/test'
import { noFilters, periodBounds, transactionQuery, UNCATEGORIZED } from '../src/ledger/filters.ts'

// --- Filter state → /api/transactions query (issue #78) ---
// The screen's filter state maps to the server's query strings: empty
// selections are omitted entirely (the server ignores '' but the client
// shouldn't ship noise), the search needle is trimmed, and the
// Uncategorized state rides the server's 'uncategorized' sentinel — a
// state, not a Category row, so it can't collide with a real id
// (apps/server/src/transactions.ts).

// Every query carries "today" explicitly so period bounds never read the
// clock — the screen passes the device's local calendar date.
const TODAY = '2026-08-13'

test('no filters produce an empty query', () => {
  expect(transactionQuery(noFilters, TODAY)).toEqual({})
})

test('each set filter maps to its query string', () => {
  expect(
    transactionQuery(
      {
        accountId: 'acc-1',
        categoryId: 'cat-9',
        view: 'expense',
        period: 'this-month',
        q: ' coffee ',
      },
      TODAY,
    ),
  ).toEqual({
    accountId: 'acc-1',
    categoryId: 'cat-9',
    view: 'expense',
    from: '2026-08-01',
    to: '2026-08-31',
    q: 'coffee',
  })
})

test('the Uncategorized selection ships the server sentinel', () => {
  expect(transactionQuery({ ...noFilters, categoryId: UNCATEGORIZED }, TODAY)).toEqual({
    categoryId: 'uncategorized',
  })
})

test('a whitespace-only search is no search at all', () => {
  expect(transactionQuery({ ...noFilters, q: '   ' }, TODAY)).toEqual({})
})

// --- Period presets over the inclusive from/to bounds ---
// Whole calendar months, both bounds set: the upper bound includes rows
// dated later in the current month (future-dated entries are legal — a
// Transaction carries a calendar date, not a timestamp).

test('this month spans the first to the last day of the current month', () => {
  expect(periodBounds('this-month', '2026-08-13')).toEqual({
    from: '2026-08-01',
    to: '2026-08-31',
  })
})

test('last month rolls over a year boundary', () => {
  expect(periodBounds('last-month', '2026-01-05')).toEqual({
    from: '2025-12-01',
    to: '2025-12-31',
  })
})

test('last 3 months reach back two months and honour February in a leap year', () => {
  expect(periodBounds('last-3-months', '2024-04-10')).toEqual({
    from: '2024-02-01',
    to: '2024-04-30',
  })
  // 2026 is not a leap year: a range ending in February tops out at the 28th.
  expect(periodBounds('last-month', '2026-03-15')).toEqual({
    from: '2026-02-01',
    to: '2026-02-28',
  })
})

test('no preset means no bounds', () => {
  expect(periodBounds('', '2026-08-13')).toEqual({})
})
