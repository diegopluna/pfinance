import {
  account,
  accountKind,
  isAccountType,
  transaction,
  type AccountType,
  type Db,
} from '@pfinance/db'
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Parsed } from './parsed.ts'
import { owned, type Scope } from './scope.ts'

// Parsing and shaping for the /api/accounts surface (issue #7). The editable
// state of an Account is exactly { name, type, openingBalance }; Balance is
// derived (ADR 0001) and deliberately absent here, so a client can never
// write it.

export interface AccountFields {
  name: string
  type: AccountType
  openingBalance: number
}

const parseName = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

// Integer minor units only (ADR 0006): floats and decimal strings must be
// converted at the presentation edge, never accepted by the API.
const parseOpeningBalance = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined

export const parseNewAccount = (body: unknown): Parsed<AccountFields> => {
  const record = (body ?? {}) as Record<string, unknown>
  const name = parseName(record.name)
  if (name === undefined) return { ok: false, error: 'An account needs a name.' }
  if (!isAccountType(record.type)) return { ok: false, error: 'Unknown account type.' }
  const openingBalance = parseOpeningBalance(record.openingBalance)
  if (openingBalance === undefined) {
    return { ok: false, error: 'Opening balance must be an integer amount in minor units.' }
  }
  return { ok: true, value: { name, type: record.type, openingBalance } }
}

// PATCH accepts any subset of the editable fields — but at least one, so a
// request that only carries non-editable state (e.g. `balance`) fails loudly
// instead of succeeding as a no-op.
export const parseAccountPatch = (body: unknown): Parsed<Partial<AccountFields>> => {
  const record = (body ?? {}) as Record<string, unknown>
  const patch: Partial<AccountFields> = {}
  if ('name' in record) {
    const name = parseName(record.name)
    if (name === undefined) return { ok: false, error: 'An account needs a name.' }
    patch.name = name
  }
  if ('type' in record) {
    if (!isAccountType(record.type)) return { ok: false, error: 'Unknown account type.' }
    patch.type = record.type
  }
  if ('openingBalance' in record) {
    const openingBalance = parseOpeningBalance(record.openingBalance)
    if (openingBalance === undefined) {
      return { ok: false, error: 'Opening balance must be an integer amount in minor units.' }
    }
    patch.openingBalance = openingBalance
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'Nothing to update: send name, type, or openingBalance.' }
  }
  return { ok: true, value: patch }
}

// Archive / unarchive an Account, scoped to the caller's Household. The
// state flip is conditional so a repeat call can't rewrite history — the
// original archivedAt is when the account closed, and a second click must
// not move it. Returns the row (updated or already in the requested state),
// or undefined when no such Account exists.
export const setAccountArchived = async (db: Db, scope: Scope, id: string, archived: boolean) => {
  const target = and(eq(account.id, id), owned.account(scope))
  const [updated] = await db
    .update(account)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(target, archived ? isNull(account.archivedAt) : isNotNull(account.archivedAt)))
    .returning()
  if (updated !== undefined) return updated
  // Nothing flipped: idempotent no-op if the Account is already in the
  // requested state, undefined (→ 404) if it doesn't exist.
  const [existing] = await db.select().from(account).where(target).limit(1)
  return existing
}

// The sum of an Account's Transactions, computed in SQL — the reason amounts
// are INTEGERs (ADR 0006). Exposed both as an expression (for the grouped
// list query) and as a single-account fetch (for mutation responses).
// Tenancy contract: scoped by accountId only — the caller must hold a
// scope-proven Account (requireAccount or a scoped find).
export const ledgerSumExpr = sql<number>`coalesce(sum(${transaction.amount}), 0)`.mapWith(Number)

export const ledgerSum = async (db: Db, accountId: string): Promise<number> => {
  const [row] = await db
    .select({ total: ledgerSumExpr })
    .from(transaction)
    .where(eq(transaction.accountId, accountId))
  return row?.total ?? 0
}

// The API shape of an Account: the row plus its derived kind and Balance —
// opening balance plus the ledger sum (ADR 0001), never a stored column.
export const accountView = (row: typeof account.$inferSelect, ledgerTotal: number) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  kind: accountKind(row.type),
  openingBalance: row.openingBalance,
  balance: row.openingBalance + ledgerTotal,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
})
