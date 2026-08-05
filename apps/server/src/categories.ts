import { category, type Db } from '@pfinance/db'
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { Parsed } from './parsed.ts'

// Seeds, parsing and archive semantics for the /api/categories surface
// (issue #10, ADR 0003). A Category is a flat household-owned label; its
// editable state is exactly { name } — no parent, no budget, no color.

// The default vocabulary every Household starts with (spec #1, story 34:
// "Groceries, Rent, Transport, Salary..."). A seeded row's id is
// `${householdId}:${slug}` — deterministic, so seeding is idempotent via
// insert-or-ignore: the backfill of Households created before this ticket
// runs "once" by construction (a rename or archive keeps the row and its id,
// so nothing ever reappears), and two racing backfills can't double-insert.
export const SEED_CATEGORIES = [
  { slug: 'groceries', name: 'Groceries' },
  { slug: 'rent', name: 'Rent' },
  { slug: 'utilities', name: 'Utilities' },
  { slug: 'transport', name: 'Transport' },
  { slug: 'dining-out', name: 'Dining Out' },
  { slug: 'entertainment', name: 'Entertainment' },
  { slug: 'health', name: 'Health' },
  { slug: 'shopping', name: 'Shopping' },
  { slug: 'subscriptions', name: 'Subscriptions' },
  { slug: 'travel', name: 'Travel' },
  { slug: 'salary', name: 'Salary' },
] as const

export const seedCategoryRows = (householdId: string, createdAt: Date) =>
  SEED_CATEGORIES.map(({ slug, name }) => ({
    id: `${householdId}:${slug}`,
    householdId,
    name,
    archivedAt: null,
    createdAt,
  }))

// Backfill for Households that predate seeding-at-creation, run from every
// route that can put the first row in place (list and create) so no ordering
// of calls dodges it. Zero rows means never seeded: Categories are archived,
// never deleted, so a Household that has been seeded keeps at least one row
// forever. The conflict-ignore makes the check-then-insert race harmless.
export const ensureSeededCategories = async (db: Db, householdId: string) => {
  const [existing] = await db
    .select({ id: category.id })
    .from(category)
    .where(eq(category.householdId, householdId))
    .limit(1)
  if (existing !== undefined) return
  await db.insert(category).values(seedCategoryRows(householdId, new Date())).onConflictDoNothing()
}

export interface CategoryFields {
  name: string
}

// Shared by POST (create) and PATCH (rename): name is the entire editable
// state, so both accept exactly { name }.
export const parseCategoryFields = (body: unknown): Parsed<CategoryFields> => {
  const record = (body ?? {}) as Record<string, unknown>
  if (typeof record.name !== 'string' || record.name.trim() === '') {
    return { ok: false, error: 'A category needs a name.' }
  }
  return { ok: true, value: { name: record.name.trim() } }
}

// Archive / unarchive a Category, scoped to the caller's Household. Same
// shape as setAccountArchived (accounts.ts): the flip is conditional so a
// repeat call keeps the original archivedAt instead of rewriting it. Returns
// the row (updated or already in the requested state), or undefined when no
// such Category exists.
export const setCategoryArchived = async (
  db: Db,
  householdId: string,
  id: string,
  archived: boolean,
) => {
  const scope = and(eq(category.id, id), eq(category.householdId, householdId))
  const [updated] = await db
    .update(category)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(scope, archived ? isNull(category.archivedAt) : isNotNull(category.archivedAt)))
    .returning()
  if (updated !== undefined) return updated
  const [existing] = await db.select().from(category).where(scope).limit(1)
  return existing
}

// Alphabetical, case-folded: the list is a vocabulary, not a ledger, so
// users scan it by name — seeded and user-added names must interleave
// regardless of capitalization. Id breaks exact-name ties stably.
export const categoryOrder = [asc(sql`lower(${category.name})`), asc(category.id)]

// The API shape of a Category: the row minus its tenancy column.
export const categoryView = (row: typeof category.$inferSelect) => ({
  id: row.id,
  name: row.name,
  archivedAt: row.archivedAt,
  createdAt: row.createdAt,
})
