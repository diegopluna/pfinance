import type { QueryClient } from '@tanstack/react-query'

// The cache vocabulary: every query key is minted here, so a query's key and
// the prefix that invalidates it can never drift apart. Call with arguments
// for a concrete query's key; call without for the invalidation prefix.
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
  imports: () => ['imports'] as const,
  importPreview: (importId: string | undefined, mapping: unknown) =>
    ['import-preview', importId, mapping] as const,
  members: () => ['members'] as const,
  invites: () => ['invites'] as const,
  netWorth: () => ['net-worth'] as const,
  spending: (month: string) => ['spending-by-category', month] as const,
  incomeExpense: () => ['income-vs-expense'] as const,
}

// The one statement of the derived-ledger rule (ADR 0001): a write to the
// Ledger — a Transaction, a Transfer, an Import confirm or revert — must
// refresh the Transactions list AND the Accounts, because every Balance is a
// derived sum over the same rows. Previously restated at five call sites.
export const invalidateLedger = async (queryClient: QueryClient) => {
  await queryClient.invalidateQueries({ queryKey: keys.transactions() })
  await queryClient.invalidateQueries({ queryKey: keys.accounts() })
}
