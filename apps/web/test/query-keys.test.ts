import { QueryClient } from '@tanstack/react-query'
import { expect, test } from 'vite-plus/test'
import { invalidateLedger, keys } from '../src/lib/query-keys'

// --- The cache vocabulary (lib/query-keys.ts) ---
// Pins the derived-ledger invalidation graph (ADR 0001): a ledger write
// refreshes every transactions query and every accounts query — filtered or
// not — and touches nothing else. A real QueryClient, no DOM.

test('keys called without arguments prefix their parameterized forms', () => {
  expect(keys.transactions({ accountId: 'a1' }).slice(0, 1)).toEqual([...keys.transactions()])
  expect(keys.accounts(true).slice(0, 1)).toEqual([...keys.accounts()])
  expect(keys.categories(false).slice(0, 1)).toEqual([...keys.categories()])
})

test('invalidateLedger invalidates transactions and accounts, and nothing else', async () => {
  const queryClient = new QueryClient()
  const seeded = [
    keys.transactions(),
    keys.transactions({ accountId: 'a1', view: 'expense' }),
    keys.accounts(true),
    keys.accounts(false),
    keys.categories(true),
    keys.imports(),
    keys.me(),
    keys.netWorth(),
  ]
  for (const key of seeded) {
    queryClient.setQueryData(key, { seeded: true })
  }

  await invalidateLedger(queryClient)

  const invalidated = queryClient
    .getQueryCache()
    .getAll()
    .filter((query) => query.state.isInvalidated)
    .map((query) => query.queryKey)
  expect(invalidated).toEqual([
    keys.transactions(),
    keys.transactions({ accountId: 'a1', view: 'expense' }),
    keys.accounts(true),
    keys.accounts(false),
  ])
})
