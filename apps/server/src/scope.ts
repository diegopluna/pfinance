import { account, category, csvImport, household, invite, member, transaction } from '@pfinance/db'
import type { Db } from '@pfinance/db'
import { and, eq, type SQL } from 'drizzle-orm'

// The HouseholdScope module: tenancy as an interface. A Household must never
// see another Household's rows, and this file is that invariant's one home —
// the context every data access takes, the two scoping mechanisms, and the
// cross-aggregate guards. scope.test.ts proves the isolation with two real
// Households, which the HTTP seam structurally cannot set up (ADR 0004).

// The tenancy-and-actor context, resolved once per request by the session
// middleware in index.ts (c.var.scope). Every module function that touches
// Household data takes one — a bare householdId parameter anywhere in
// apps/server/src is a smell. Pre-tenancy code (auth.ts sign-up flows,
// invite-token lookups) is the deliberate exception: no session, no Scope.
export interface Scope {
  householdId: string
  userId: string
}

// Mechanism 1 — the direct predicate, for tables that carry householdId
// themselves (and the household row, keyed by id). One definition per table;
// queries compose these into their and(...) chains.
export const owned = {
  household: (scope: Scope): SQL => eq(household.id, scope.householdId),
  account: (scope: Scope): SQL => eq(account.householdId, scope.householdId),
  category: (scope: Scope): SQL => eq(category.householdId, scope.householdId),
  member: (scope: Scope): SQL => eq(member.householdId, scope.householdId),
  invite: (scope: Scope): SQL => eq(invite.householdId, scope.householdId),
  // Mechanism 2's predicate half: rows whose Household is their Account's
  // (transaction, csv_import carry no householdId by design — they can never
  // disagree with their Account about tenancy). Pair with the join below.
  ledger: (scope: Scope): SQL => eq(account.householdId, scope.householdId),
}

// Mechanism 2 — the through-Account joins. A scoped ledger read is always
// `innerJoin(account, <join>) … where(and(owned.ledger(scope), …))`.
export const ledgerAccountJoin = eq(account.id, transaction.accountId)
export const importAccountJoin = eq(account.id, csvImport.accountId)

// Tenancy guard for writes that name an Account: a Transaction's (and an
// Import's) Household is its Account's, so writes prove the Account and
// reads join through it. A foreign Account reads as unknown, not forbidden.
export const requireAccount = async (db: Db, scope: Scope, accountId: string) => {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.id, accountId), owned.account(scope)))
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
export const requireCategory = async (db: Db, scope: Scope, categoryId: string) => {
  const [row] = await db
    .select({ archivedAt: category.archivedAt })
    .from(category)
    .where(and(eq(category.id, categoryId), owned.category(scope)))
    .limit(1)
  if (row === undefined) return 'Unknown category.'
  if (row.archivedAt !== null) return 'That category is archived; unarchive it to assign it.'
  return undefined
}
