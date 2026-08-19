import type { TransactionKind } from '@pfinance/db/transaction-kinds'
import type { TransactionFields } from './draft'

// The cleanup queue (issue #82): the couch-time flow that keeps the charts
// meaningful after a CSV import. The server's `uncategorized` filter is
// `categoryId IS NULL`, which also matches Transfer legs (which carry no
// Category by definition — ADR 0003) and Balance Adjustments (which never
// reach the spending charts) — so the queue keeps exactly the standard
// rows: the ones whose missing Category actually costs the charts
// something. Free of react-native imports so the workspace's node test
// runner covers it.

export interface CleanupEntry {
  id: string
  kind: TransactionKind
  categoryId: string | null
  accountId: string
  date: string
  amount: number
  description: string
}

export const cleanupQueue = <Entry extends CleanupEntry>(entries: Entry[]): Entry[] =>
  entries.filter((entry) => entry.kind === 'standard' && entry.categoryId === null)

// The whole PATCH body for one assignment: the API edits whole rows, so
// every field rides along unchanged and only the Category moves. The kind
// is 'standard' by construction — the queue admits nothing else.
export const assignedFields = (entry: CleanupEntry, categoryId: string): TransactionFields => ({
  accountId: entry.accountId,
  date: entry.date,
  amount: entry.amount,
  description: entry.description,
  kind: 'standard',
  categoryId,
})
