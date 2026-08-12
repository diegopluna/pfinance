import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { account, household, member, user, type Db } from '@pfinance/db'
import { drizzle } from 'drizzle-orm/libsql'

// An in-memory libsql database stands in for D1 in the ledger-verbs unit
// tests: the pinned drizzle-orm exposes the same async-SQLite base class and
// the same batch API on both drivers, which is exactly what the widened Db
// type in @pfinance/db names — this harness is its second adapter. Two D1
// behaviors are NOT reproduced, so local green is not D1 green for them:
//  - foreign-key enforcement: D1 has it on, libsql defaults off; the PRAGMA
//    below matches D1 so the schema's cascades (transfer legs, import
//    revert) fire as deployed.
//  - the 100-bound-params-per-statement cap: libsql accepts statements real
//    D1 would reject, so chunk sizing (IMPORT_INSERT_CHUNK) is covered by
//    its own arithmetic test and the HTTP imports suite, never by this
//    harness.

const migrationsDir = fileURLToPath(
  new URL('../../../packages/db/migrations', import.meta.url).toString(),
)

// The exact SQL alchemy applies on deploy (Drizzle.Schema → D1
// migrationsDir): timestamp-prefixed directories in name order, statements
// split on the drizzle breakpoint marker. Running the real migrations means
// the test schema can never drift from the deployed one.
const migrationStatements = (): string[] =>
  readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .flatMap((name) =>
      readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8')
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter((statement) => statement !== ''),
    )

export const createTestDb = async (): Promise<Db> => {
  const client = createClient({ url: ':memory:' })
  await client.execute('PRAGMA foreign_keys = ON')
  for (const statement of migrationStatements()) {
    await client.execute(statement)
  }
  return drizzle({ client })
}

// The smallest ledger the verbs can write into: one Household, its owning
// Member, two Accounts. Unlike the HTTP harness, this can seed a second
// Household in the same database — the cross-tenant setup ADR 0004's
// sign-up lock makes impossible over HTTP.
export const seedLedger = async (db: Db, options?: { currency?: string }) => {
  const now = new Date()
  const householdId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  await db.insert(household).values({
    id: householdId,
    name: 'Test household',
    currency: options?.currency ?? 'USD',
    createdAt: now,
  })
  await db.insert(user).values({
    id: userId,
    name: 'Tester',
    email: `${userId}@example.com`,
    createdAt: now,
    updatedAt: now,
  })
  await db.insert(member).values({
    id: crypto.randomUUID(),
    userId,
    householdId,
    role: 'owner',
    createdAt: now,
  })
  const accountId = crypto.randomUUID()
  const otherAccountId = crypto.randomUUID()
  await db.insert(account).values([
    {
      id: accountId,
      householdId,
      name: 'Checking',
      type: 'checking',
      openingBalance: 0,
      archivedAt: null,
      createdAt: now,
    },
    {
      id: otherAccountId,
      householdId,
      name: 'Savings',
      type: 'savings',
      openingBalance: 0,
      archivedAt: null,
      createdAt: now,
    },
  ])
  return { householdId, userId, accountId, otherAccountId }
}
