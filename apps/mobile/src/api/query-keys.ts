import type { QueryClient } from '@tanstack/react-query'

// The cache vocabulary, mirroring apps/web/src/lib/query-keys.ts: every
// query key is minted here, so a query's key and the prefix that
// invalidates it can never drift apart. Call with arguments for a concrete
// query's key; call without for the invalidation prefix. The keys carry no
// Server URL — the app holds exactly one Server at a time and sign-out
// clears the whole cache — so they stay identical to the web's.
export const keys = {
  me: () => ['me'] as const,
  accounts: (includeArchived?: boolean) =>
    includeArchived === undefined
      ? (['accounts'] as const)
      : (['accounts', includeArchived] as const),
  categories: (includeArchived?: boolean) =>
    includeArchived === undefined
      ? (['categories'] as const)
      : (['categories', includeArchived] as const),
  transactions: (filters?: unknown) =>
    filters === undefined ? (['transactions'] as const) : (['transactions', filters] as const),
  netWorth: () => ['net-worth'] as const,
  spending: (month?: string) =>
    month === undefined
      ? (['spending-by-category'] as const)
      : (['spending-by-category', month] as const),
  incomeExpense: () => ['income-vs-expense'] as const,
}

// The one statement of the derived-ledger rule (ADR 0001): a write to the
// Ledger must refresh everything derived from it, because none of it is
// stored — Balances, Net Worth, and both monthly views are sums over the
// same rows.
//
// This goes wider than the web's invalidateLedger, which stops at
// Transactions and Accounts. On a phone the home screen *is* the dashboard,
// and it is the screen a save returns to: leaving net worth and this
// month's totals cached there would show a household stale numbers one tap
// after it entered the transaction that changed them. (The web has the same
// exposure on its dashboard — worth raising there rather than fixing here.)
export const invalidateLedger = async (queryClient: QueryClient) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.transactions() }),
    queryClient.invalidateQueries({ queryKey: keys.accounts() }),
    queryClient.invalidateQueries({ queryKey: keys.netWorth() }),
    queryClient.invalidateQueries({ queryKey: keys.spending() }),
    queryClient.invalidateQueries({ queryKey: keys.incomeExpense() }),
  ])
}
