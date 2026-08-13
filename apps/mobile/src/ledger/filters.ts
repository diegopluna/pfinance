// The mobile Transaction list's filter state and its mapping onto the
// server's query strings (issue #78). '' means "not filtering" for every
// field; the Uncategorized selection is the server's query-string sentinel
// 'uncategorized' — a state, not a Category row, so it can't collide with a
// real id (apps/server/src/transactions.ts). Free of react-native imports
// so the workspace's node test runner covers it.

export interface TransactionFilters {
  accountId: string
  // '' = all, the 'uncategorized' sentinel, or a Category id.
  categoryId: string
  // '' = the whole Ledger; the derived views exclude Transfers and Balance
  // Adjustments by definition (CONTEXT.md).
  view: '' | 'expense' | 'income'
  q: string
}

export const noFilters: TransactionFilters = { accountId: '', categoryId: '', view: '', q: '' }

// The wire shape: exactly the subset of the server's list filters this
// screen drives, with view keeping its literal type for the RPC client.
export interface TransactionQuery {
  accountId?: string
  categoryId?: string
  view?: 'expense' | 'income'
  q?: string
}

// Only set filters ship — the server ignores '' values, but the request
// shouldn't carry noise — and the search needle is trimmed the way the
// server would trim it.
export const transactionQuery = (filters: TransactionFilters): TransactionQuery => {
  const q = filters.q.trim()
  return {
    ...(filters.accountId === '' ? {} : { accountId: filters.accountId }),
    ...(filters.categoryId === '' ? {} : { categoryId: filters.categoryId }),
    ...(filters.view === '' ? {} : { view: filters.view }),
    ...(q === '' ? {} : { q }),
  }
}
