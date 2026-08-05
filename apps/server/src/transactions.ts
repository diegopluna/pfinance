import {
  account,
  isTransactionKind,
  transaction,
  user,
  type Db,
  type TransactionKind,
} from '@pfinance/db'
import { and, asc, desc, eq, gt, gte, lt, lte, sql, type SQL } from 'drizzle-orm'
import type { Parsed } from './parsed.ts'

// Parsing and shaping for the /api/transactions surface (issue #8). A
// Transaction's editable state is exactly { accountId, date, amount,
// description, kind }; who entered it and when are recorded once at creation.

export interface TransactionFields {
  accountId: string
  date: string
  amount: number
  description: string
  kind: TransactionKind
}

// A calendar date is an ISO `YYYY-MM-DD` string naming a real day — never a
// timestamp (CONTEXT.md). Validated structurally and against the calendar
// (rejects 2026-02-30) without ever constructing a Date, so no timezone can
// touch it.
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

const isCalendarDate = (value: unknown): value is string => {
  if (typeof value !== 'string') return false
  const match = CALENDAR_DATE.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return false
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= (daysInMonth[month - 1] ?? 0)
}

const parseDescription = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

// Signed integer minor units only (ADR 0006): negative = money out.
const parseAmount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined

const parseAccountId = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

export const parseNewTransaction = (body: unknown): Parsed<TransactionFields> => {
  const record = (body ?? {}) as Record<string, unknown>
  const accountId = parseAccountId(record.accountId)
  if (accountId === undefined) return { ok: false, error: 'A transaction needs an account.' }
  if (!isCalendarDate(record.date)) {
    return { ok: false, error: 'Date must be a calendar date like 2026-01-15.' }
  }
  const amount = parseAmount(record.amount)
  if (amount === undefined) {
    return { ok: false, error: 'Amount must be a signed integer in minor units.' }
  }
  const description = parseDescription(record.description)
  if (description === undefined) return { ok: false, error: 'A transaction needs a description.' }
  // Absent means standard — the ordinary ledger entry; anything sent must
  // name a known kind (transaction-kinds.ts), never be silently coerced.
  const kind = record.kind === undefined ? 'standard' : record.kind
  if (!isTransactionKind(kind)) return { ok: false, error: 'Unknown transaction kind.' }
  return { ok: true, value: { accountId, date: record.date, amount, description, kind } }
}

// PATCH accepts any subset of the editable fields — but at least one, so a
// request that only carries non-editable state (e.g. `enteredBy`) fails
// loudly instead of succeeding as a no-op.
export const parseTransactionPatch = (body: unknown): Parsed<Partial<TransactionFields>> => {
  const record = (body ?? {}) as Record<string, unknown>
  const patch: Partial<TransactionFields> = {}
  if ('accountId' in record) {
    const accountId = parseAccountId(record.accountId)
    if (accountId === undefined) return { ok: false, error: 'A transaction needs an account.' }
    patch.accountId = accountId
  }
  if ('date' in record) {
    if (!isCalendarDate(record.date)) {
      return { ok: false, error: 'Date must be a calendar date like 2026-01-15.' }
    }
    patch.date = record.date
  }
  if ('amount' in record) {
    const amount = parseAmount(record.amount)
    if (amount === undefined) {
      return { ok: false, error: 'Amount must be a signed integer in minor units.' }
    }
    patch.amount = amount
  }
  if ('description' in record) {
    const description = parseDescription(record.description)
    if (description === undefined) {
      return { ok: false, error: 'A transaction needs a description.' }
    }
    patch.description = description
  }
  if ('kind' in record) {
    // No undefined-means-default here: a kind that is sent must be valid.
    if (!isTransactionKind(record.kind)) {
      return { ok: false, error: 'Unknown transaction kind.' }
    }
    patch.kind = record.kind
  }
  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error: 'Nothing to update: send accountId, date, amount, description, or kind.',
    }
  }
  return { ok: true, value: patch }
}

// List filters: Account, inclusive date range, description search, and the
// derived view. Dates are validated as calendar dates — a malformed bound is
// rejected, never silently ignored (it would quietly widen the range), and
// an unknown view is rejected the same way.
export interface TransactionFilters {
  accountId?: string
  from?: string
  to?: string
  q?: string
  view?: DerivedView
}

// Expense and Income are derived views, not stored kinds (CONTEXT.md): the
// sign carries the direction, and Balance Adjustments are excluded by
// definition (issue #9). Transfer legs will join the exclusion with issue
// #12. Issue #19's aggregates must reuse this predicate.
export const DERIVED_VIEW_VALUES = ['expense', 'income'] as const

export type DerivedView = (typeof DERIVED_VIEW_VALUES)[number]

const isDerivedView = (value: string): value is DerivedView =>
  (DERIVED_VIEW_VALUES as readonly string[]).includes(value)

export const derivedViewConditions = (view: DerivedView): SQL[] => [
  eq(transaction.kind, 'standard'),
  view === 'expense' ? lt(transaction.amount, 0) : gt(transaction.amount, 0),
]

export const parseTransactionFilters = (
  query: Record<string, string | undefined>,
): Parsed<TransactionFilters> => {
  const filters: TransactionFilters = {}
  if (query.accountId !== undefined && query.accountId !== '') filters.accountId = query.accountId
  for (const bound of ['from', 'to'] as const) {
    const value = query[bound]
    if (value === undefined || value === '') continue
    if (!isCalendarDate(value)) {
      return { ok: false, error: `The ${bound} filter must be a calendar date like 2026-01-15.` }
    }
    filters[bound] = value
  }
  const q = query.q?.trim()
  if (q !== undefined && q !== '') filters.q = q
  if (query.view !== undefined && query.view !== '') {
    if (!isDerivedView(query.view)) {
      return { ok: false, error: 'The view filter must be "expense" or "income".' }
    }
    filters.view = query.view
  }
  return { ok: true, value: filters }
}

// Tenancy: a Transaction's Household is its Account's, so writes name the
// Account and reads join through it.
export const accountInHousehold = async (db: Db, householdId: string, accountId: string) => {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.id, accountId), eq(account.householdId, householdId)))
    .limit(1)
  return row !== undefined
}

// The API shape of a Transaction: the row plus who entered it, by name —
// defined once as a row mapper (for the POST handler, which knows the
// enterer directly) and mirrored by the SQL selection below (for reads,
// where the name joins in). The left join keeps ledger rows visible after
// their author's User is removed (createdBy set null) — the money still
// moved.
export const transactionView = (
  row: Omit<typeof transaction.$inferSelect, 'createdBy'>,
  enteredBy: string | null,
) => ({
  id: row.id,
  accountId: row.accountId,
  date: row.date,
  amount: row.amount,
  description: row.description,
  kind: row.kind,
  enteredBy,
  createdAt: row.createdAt,
})

const transactionSelection = {
  id: transaction.id,
  accountId: transaction.accountId,
  date: transaction.date,
  amount: transaction.amount,
  description: transaction.description,
  kind: transaction.kind,
  enteredBy: user.name,
  createdAt: transaction.createdAt,
} satisfies Record<keyof ReturnType<typeof transactionView>, unknown>

// LIKE is case-insensitive for ASCII in SQLite; % and _ in the needle are
// escaped so a search for "100%" matches literally.
const descriptionMatches = (q: string): SQL => {
  const escaped = q.replace(/[\\%_]/g, (char) => `\\${char}`)
  return sql`${transaction.description} LIKE ${`%${escaped}%`} ESCAPE '\\'`
}

export const listTransactions = (db: Db, householdId: string, filters: TransactionFilters) =>
  db
    .select(transactionSelection)
    .from(transaction)
    .innerJoin(account, eq(account.id, transaction.accountId))
    .leftJoin(user, eq(user.id, transaction.createdBy))
    .where(
      and(
        eq(account.householdId, householdId),
        ...(filters.accountId === undefined ? [] : [eq(transaction.accountId, filters.accountId)]),
        // Lexicographic comparison IS chronological for YYYY-MM-DD strings.
        ...(filters.from === undefined ? [] : [gte(transaction.date, filters.from)]),
        ...(filters.to === undefined ? [] : [lte(transaction.date, filters.to)]),
        ...(filters.q === undefined ? [] : [descriptionMatches(filters.q)]),
        ...(filters.view === undefined ? [] : derivedViewConditions(filters.view)),
      ),
    )
    // Newest ledger entries first; createdAt (then id) breaks same-day ties.
    .orderBy(desc(transaction.date), desc(transaction.createdAt), asc(transaction.id))

// Fetch one Transaction scoped to the caller's Household, or undefined.
export const findTransaction = async (db: Db, householdId: string, id: string) => {
  const [row] = await db
    .select(transactionSelection)
    .from(transaction)
    .innerJoin(account, eq(account.id, transaction.accountId))
    .leftJoin(user, eq(user.id, transaction.createdBy))
    .where(and(eq(transaction.id, id), eq(account.householdId, householdId)))
    .limit(1)
  return row
}
