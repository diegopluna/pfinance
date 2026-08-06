import {
  account,
  category,
  isTransactionKind,
  transaction,
  user,
  type Db,
  type TransactionKind,
} from '@pfinance/db'
import { and, asc, desc, eq, gt, gte, isNull, lt, lte, ne, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { Parsed } from './parsed.ts'

// Parsing and shaping for the /api/transactions surface (issue #8). A
// Transaction's editable state is exactly { accountId, date, amount,
// description, kind, categoryId }; who entered it and when are recorded once
// at creation.

export interface TransactionFields {
  accountId: string
  date: string
  amount: number
  description: string
  kind: TransactionKind
  // Exactly one Category or null = Uncategorized (ADR 0003, issue #11).
  categoryId: string | null
}

// A calendar date is an ISO `YYYY-MM-DD` string naming a real day — never a
// timestamp (CONTEXT.md). Validated structurally and against the calendar
// (rejects 2026-02-30) without ever constructing a Date, so no timezone can
// touch it.
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export const isCalendarDate = (value: unknown): value is string => {
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

export const parseDescription = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

// Signed integer minor units only (ADR 0006): negative = money out.
const parseAmount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined

const parseAccountId = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

// Absent and null both mean Uncategorized — the honest default (CONTEXT.md);
// anything else must be a plausible id, never coerced. Returns undefined
// only for invalid input (the parsed value is string | null).
const parseCategoryId = (value: unknown): string | null | undefined => {
  if (value === undefined || value === null) return null
  return typeof value === 'string' && value !== '' ? value : undefined
}

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
  // name a known kind (transaction-kinds.ts), never be silently coerced. The
  // transfer kind is known but never writable here: a lone leg can only
  // exist through /api/transfers (issue #12).
  const kind = record.kind === undefined ? 'standard' : record.kind
  if (kind === 'transfer') {
    return { ok: false, error: 'Transfer legs are created through /api/transfers.' }
  }
  if (!isTransactionKind(kind)) return { ok: false, error: 'Unknown transaction kind.' }
  const categoryId = parseCategoryId(record.categoryId)
  if (categoryId === undefined) {
    return { ok: false, error: 'Category must be a category id, or absent for Uncategorized.' }
  }
  return {
    ok: true,
    value: { accountId, date: record.date, amount, description, kind, categoryId },
  }
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
    // No undefined-means-default here: a kind that is sent must be valid —
    // and a row can't become a lone Transfer leg (issue #12).
    if (record.kind === 'transfer') {
      return { ok: false, error: 'A transaction cannot become a transfer leg; use /api/transfers.' }
    }
    if (!isTransactionKind(record.kind)) {
      return { ok: false, error: 'Unknown transaction kind.' }
    }
    patch.kind = record.kind
  }
  if ('categoryId' in record) {
    // An explicit null clears the Category — back to Uncategorized.
    const categoryId = parseCategoryId(record.categoryId)
    if (categoryId === undefined) {
      return { ok: false, error: 'Category must be a category id, or null for Uncategorized.' }
    }
    patch.categoryId = categoryId
  }
  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error: 'Nothing to update: send accountId, date, amount, description, kind, or categoryId.',
    }
  }
  return { ok: true, value: patch }
}

// List filters: Account, Category, inclusive date range, description search,
// and the derived view. Dates are validated as calendar dates — a malformed
// bound is rejected, never silently ignored (it would quietly widen the
// range), and an unknown view is rejected the same way.
export interface TransactionFilters {
  accountId?: string
  // A Category id, or null for the Uncategorized filter (the query-string
  // sentinel `uncategorized` — ids are UUIDs or `${householdId}:${slug}`, so
  // the bare word can never name a real one).
  categoryId?: string | null
  from?: string
  to?: string
  q?: string
  view?: DerivedView
}

// Expense and Income are derived views, not stored kinds (CONTEXT.md): the
// sign carries the direction, and only the standard kind is spending or
// earning — Balance Adjustments (issue #9) and Transfer legs (issue #12) are
// excluded by definition. Issue #19's aggregates must reuse this predicate.
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
  if (query.categoryId !== undefined && query.categoryId !== '') {
    filters.categoryId = query.categoryId === 'uncategorized' ? null : query.categoryId
  }
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

// Assignment guard (issue #11): a Category is assignable when it belongs to
// the caller's Household — the FK can't see tenancy, since a Category's
// Household is its own while a Transaction's is its Account's — and is not
// archived (issue #10: archiving retires a label from assignment; rows that
// already carry it keep it, because this runs only when a write names a
// Category). Returns the rejection message, or undefined when assignable; a
// foreign Category reads as unknown, not forbidden.
export const categoryAssignmentError = async (db: Db, householdId: string, categoryId: string) => {
  const [row] = await db
    .select({ archivedAt: category.archivedAt })
    .from(category)
    .where(and(eq(category.id, categoryId), eq(category.householdId, householdId)))
    .limit(1)
  if (row === undefined) return 'Unknown category.'
  if (row.archivedAt !== null) return 'That category is archived; unarchive it to assign it.'
  return undefined
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
  categoryId: row.categoryId,
  transferId: row.transferId,
  // The other leg's Account when this row is a Transfer leg (issue #12) —
  // the client renders and edits the whole Transfer from either leg. This
  // mapper serves POST /api/transactions, which never creates legs.
  counterpartAccountId: null as string | null,
  enteredBy,
  createdAt: row.createdAt,
})

// The sibling alias joins each Transfer leg to its other half; rows with no
// transferId match nothing (NULL never equals NULL), so counterpart stays
// null for everything but legs.
const siblingLeg = alias(transaction, 'sibling_leg')

const transactionSelection = {
  id: transaction.id,
  accountId: transaction.accountId,
  date: transaction.date,
  amount: transaction.amount,
  description: transaction.description,
  kind: transaction.kind,
  categoryId: transaction.categoryId,
  transferId: transaction.transferId,
  counterpartAccountId: siblingLeg.accountId,
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
    .leftJoin(
      siblingLeg,
      and(eq(siblingLeg.transferId, transaction.transferId), ne(siblingLeg.id, transaction.id)),
    )
    .where(
      and(
        eq(account.householdId, householdId),
        ...(filters.accountId === undefined ? [] : [eq(transaction.accountId, filters.accountId)]),
        // null filters the Uncategorized state — rows with no Category.
        ...(filters.categoryId === undefined
          ? []
          : [
              filters.categoryId === null
                ? isNull(transaction.categoryId)
                : eq(transaction.categoryId, filters.categoryId),
            ]),
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
    .leftJoin(
      siblingLeg,
      and(eq(siblingLeg.transferId, transaction.transferId), ne(siblingLeg.id, transaction.id)),
    )
    .where(and(eq(transaction.id, id), eq(account.householdId, householdId)))
    .limit(1)
  return row
}
