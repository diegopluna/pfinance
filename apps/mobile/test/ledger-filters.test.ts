import { expect, test } from 'vite-plus/test'
import { noFilters, transactionQuery } from '../src/ledger/filters.ts'

// --- Filter state → /api/transactions query (issue #78) ---
// The screen's filter state maps to the server's query strings: empty
// selections are omitted entirely (the server ignores '' but the client
// shouldn't ship noise), the search needle is trimmed, and the
// Uncategorized state rides the server's 'uncategorized' sentinel — a
// state, not a Category row, so it can't collide with a real id
// (apps/server/src/transactions.ts).

test('no filters produce an empty query', () => {
  expect(transactionQuery(noFilters)).toEqual({})
})

test('each set filter maps to its query string', () => {
  expect(
    transactionQuery({
      accountId: 'acc-1',
      categoryId: 'cat-9',
      view: 'expense',
      q: ' coffee ',
    }),
  ).toEqual({ accountId: 'acc-1', categoryId: 'cat-9', view: 'expense', q: 'coffee' })
})

test('the Uncategorized selection ships the server sentinel', () => {
  expect(transactionQuery({ ...noFilters, categoryId: 'uncategorized' })).toEqual({
    categoryId: 'uncategorized',
  })
})

test('a whitespace-only search is no search at all', () => {
  expect(transactionQuery({ ...noFilters, q: '   ' })).toEqual({})
})
