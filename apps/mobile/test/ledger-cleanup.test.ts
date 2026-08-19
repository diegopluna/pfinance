import { expect, test } from 'vite-plus/test'
import { assignedFields, cleanupQueue } from '../src/ledger/cleanup.ts'

// --- The cleanup queue (issue #82) ---
// The server's `uncategorized` filter is `categoryId IS NULL`, which also
// matches Transfer legs and Balance Adjustments; the queue keeps exactly
// the standard rows — the ones whose missing Category costs the charts.

const row = (id: string, kind: 'standard' | 'transfer' | 'balance_adjustment') => ({
  id,
  kind,
  categoryId: null,
  accountId: 'acc-1',
  date: '2026-08-12',
  amount: -41290,
  description: 'Supermercado',
})

test('only standard rows without a category queue for cleanup', () => {
  const entries = [
    row('a', 'standard'),
    row('b', 'transfer'),
    row('c', 'balance_adjustment'),
    { ...row('d', 'standard'), categoryId: 'cat-9' },
    row('e', 'standard'),
  ]
  expect(cleanupQueue(entries).map((entry) => entry.id)).toEqual(['a', 'e'])
})

test('assigning composes the whole row with only the category moved', () => {
  expect(assignedFields(row('a', 'standard'), 'cat-groceries')).toEqual({
    accountId: 'acc-1',
    date: '2026-08-12',
    amount: -41290,
    description: 'Supermercado',
    kind: 'standard',
    categoryId: 'cat-groceries',
  })
})
