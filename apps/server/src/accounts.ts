import { accountKind, isAccountType, type account, type AccountType } from '@pfinance/db'

// Parsing and shaping for the /api/accounts surface (issue #7). The editable
// state of an Account is exactly { name, type, openingBalance }; Balance is
// derived (ADR 0001) and deliberately absent here, so a client can never
// write it.

export interface AccountFields {
  name: string
  type: AccountType
  openingBalance: number
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

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

// The API shape of an Account: the row plus its derived kind and Balance.
// With no Transactions yet the ledger sum is zero, so Balance equals the
// opening balance; issue #8 adds the Transaction sum to this derivation.
export const accountView = (row: typeof account.$inferSelect) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  kind: accountKind(row.type),
  openingBalance: row.openingBalance,
  balance: row.openingBalance,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
})
