import { daysInMonth } from './dates'

// The mobile Transaction list's filter state and its mapping onto the
// server's query strings (issue #78). '' means "not filtering" for every
// field. Free of react-native imports so the workspace's node test runner
// covers it.

// The filter sentinel for the Uncategorized state — a state, not a Category
// row, so it can't collide with a real id (apps/server/src/transactions.ts:
// ids are UUIDs or `${householdId}:${slug}`, never the bare word).
export const UNCATEGORIZED = 'uncategorized'

// Whole-calendar-month windows over the server's inclusive from/to bounds —
// the phone's answer to the web's date pickers until mobile grows one.
export type PeriodPreset = '' | 'this-month' | 'last-month' | 'last-3-months'

export interface TransactionFilters {
  accountId: string
  // '' = all, the UNCATEGORIZED sentinel, or a Category id.
  categoryId: string
  // '' = the whole Ledger; the derived views exclude Transfers and Balance
  // Adjustments by definition (CONTEXT.md).
  view: '' | 'expense' | 'income'
  period: PeriodPreset
  q: string
}

export const noFilters: TransactionFilters = {
  accountId: '',
  categoryId: '',
  view: '',
  period: '',
  q: '',
}

// The wire shape: exactly the subset of the server's list filters this
// screen drives, with view keeping its literal type for the RPC client.
export interface TransactionQuery {
  accountId?: string
  categoryId?: string
  view?: 'expense' | 'income'
  from?: string
  to?: string
  q?: string
}

const pad = (value: number, length: number) => value.toString().padStart(length, '0')

const monthBounds = (year: number, month: number) => ({
  from: `${pad(year, 4)}-${pad(month, 2)}-01`,
  to: `${pad(year, 4)}-${pad(month, 2)}-${pad(daysInMonth(year, month), 2)}`,
})

// A preset's inclusive calendar bounds, computed by month arithmetic on the
// caller-supplied "today" (YYYY-MM-DD) — never via Date, so no timezone can
// shift a boundary. Both bounds always ship: the upper bound covers rows
// dated later in the current month (future-dated entries are legal — a
// Transaction carries a calendar date, not a timestamp).
export const periodBounds = (
  preset: PeriodPreset,
  today: string,
): { from?: string; to?: string } => {
  if (preset === '') return {}
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  // Months counted from zero for the modulo, back to 1-based for rendering.
  const monthsBack = (count: number) => {
    const index = year * 12 + (month - 1) - count
    return { year: Math.floor(index / 12), month: (index % 12) + 1 }
  }
  const start = monthsBack(preset === 'last-month' ? 1 : preset === 'last-3-months' ? 2 : 0)
  const end = preset === 'last-month' ? start : { year, month }
  return {
    from: monthBounds(start.year, start.month).from,
    to: monthBounds(end.year, end.month).to,
  }
}

// Only set filters ship — the server ignores '' values, but the request
// shouldn't carry noise — and the search needle is trimmed the way the
// server would trim it.
export const transactionQuery = (filters: TransactionFilters, today: string): TransactionQuery => {
  const q = filters.q.trim()
  return {
    ...(filters.accountId === '' ? {} : { accountId: filters.accountId }),
    ...(filters.categoryId === '' ? {} : { categoryId: filters.categoryId }),
    ...(filters.view === '' ? {} : { view: filters.view }),
    ...periodBounds(filters.period, today),
    ...(q === '' ? {} : { q }),
  }
}
