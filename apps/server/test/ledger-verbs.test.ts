import { csvImport, transaction, transfer, type Db } from '@pfinance/db'
import { asc, eq } from 'drizzle-orm'
import { expect, test } from 'vite-plus/test'
import { chunkRows, confirmImport, type ImportMapping } from '../src/imports.ts'
import type { Scope } from '../src/scope.ts'
import { createTestDb, seedLedger } from './db-harness.ts'

// --- Ledger verbs (Transaction, Transfer, Import write paths) ---
// Unit tests against an in-memory libsql database standing in for D1
// (db-harness.ts — see its header for the two fidelity gaps). No HTTP, no
// deploy — these run in-process.

test('the harness applies the real migrations and honors the schema cascades', async () => {
  const db = await createTestDb()
  const { userId, accountId, otherAccountId } = await seedLedger(db)
  const now = new Date()
  const transferId = crypto.randomUUID()
  const shared = {
    date: '2026-01-15',
    description: 'Transfer',
    kind: 'transfer' as const,
    categoryId: null,
    transferId,
    importId: null,
    createdBy: userId,
    createdAt: now,
  }
  // The same batch shape the Transfer write path uses: entity + both legs.
  await db.batch([
    db.insert(transfer).values({ id: transferId, createdAt: now }),
    db.insert(transaction).values([
      { id: crypto.randomUUID(), accountId, amount: -500, ...shared },
      { id: crypto.randomUUID(), accountId: otherAccountId, amount: 500, ...shared },
    ]),
  ])
  expect(await db.select().from(transaction)).toHaveLength(2)
  // FK enforcement is on (the D1 default the harness reproduces): deleting
  // the transfer entity cascades to both legs.
  await db.delete(transfer).where(eq(transfer.id, transferId))
  expect(await db.select().from(transaction)).toHaveLength(0)
})

// --- confirmImport ---

const MAPPING: ImportMapping = {
  dateColumn: 0,
  descriptionColumn: 1,
  amountColumn: 2,
  dateFormat: 'ymd',
}

// Line 2 Coffee, line 3 Salary, line 4 malformed (not a ymd date).
const CSV =
  'date,desc,amount\n2026-01-15,Coffee,-3.50\n2026-01-16,Salary,"1,000.00"\nnope,Broken,9.99\n'

const seedImport = async (
  db: Db,
  scope: Scope,
  accountId: string,
  options?: { csv?: string; mapping?: ImportMapping | null },
) => {
  const id = crypto.randomUUID()
  const csv = options?.csv ?? CSV
  const mapping = options?.mapping === undefined ? MAPPING : options.mapping
  await db.insert(csvImport).values({
    id,
    accountId,
    fileName: 'statement.csv',
    csv,
    mapping: mapping === null ? null : JSON.stringify(mapping),
    rowCount: csv.trim().split('\n').length - 1,
    createdBy: scope.userId,
    createdAt: new Date(),
    confirmedAt: null,
  })
  return id
}

test('confirmImport creates deterministic rows, counts fates, and stamps the confirmation', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId } = await seedLedger(db)
  const scope = { householdId, userId }
  const importId = await seedImport(db, scope, accountId)

  const result = await confirmImport(db, scope, importId, { overrides: [] })
  expect(result).toMatchObject({
    ok: true,
    value: {
      status: 'confirmed',
      createdCount: 2,
      malformedCount: 1,
      duplicateCount: 0,
    },
  })
  const rows = await db.select().from(transaction).orderBy(asc(transaction.id))
  expect(rows).toMatchObject([
    // Deterministic per (Import, line): the race-collision key.
    { id: `${importId}:2`, amount: -350, description: 'Coffee', kind: 'standard' },
    { id: `${importId}:3`, amount: 100000, description: 'Salary', kind: 'standard' },
  ])
  expect(rows.map((row) => row.importId)).toEqual([importId, importId])
  expect(rows.map((row) => row.categoryId)).toEqual([null, null])
  expect(rows.map((row) => row.createdBy)).toEqual([userId, userId])
})

test('confirmImport skips flagged duplicates by default and admits them per-line on override', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId } = await seedLedger(db)
  const scope = { householdId, userId }
  // Coffee already sits on the ledger: line 2 exact-matches and gets flagged.
  await db.insert(transaction).values({
    id: crypto.randomUUID(),
    accountId,
    date: '2026-01-15',
    amount: -350,
    description: 'Coffee',
    kind: 'standard',
    createdBy: userId,
    createdAt: new Date(),
  })

  const skipped = await confirmImport(db, scope, await seedImport(db, scope, accountId), {
    overrides: [],
  })
  expect(skipped).toMatchObject({
    ok: true,
    value: { createdCount: 1, duplicateCount: 1, malformedCount: 1 },
  })

  const overridden = await confirmImport(db, scope, await seedImport(db, scope, accountId), {
    overrides: [2],
  })
  expect(overridden).toMatchObject({
    ok: true,
    // The override admits line 2 — but the first confirm's Salary row now
    // flags line 3 instead: the dedup re-checks the live ledger.
    value: { createdCount: 1, duplicateCount: 1, malformedCount: 1 },
  })
})

test('confirmImport rejects a missing mapping, a repeat confirm, and a foreign Household', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId } = await seedLedger(db)
  const scope = { householdId, userId }

  const unmapped = await seedImport(db, scope, accountId, { mapping: null })
  expect(await confirmImport(db, scope, unmapped, { overrides: [] })).toEqual({
    ok: false,
    status: 400,
    error: 'Map the columns and preview before confirming.',
  })

  const importId = await seedImport(db, scope, accountId)
  expect((await confirmImport(db, scope, importId, { overrides: [] })).ok).toBe(true)
  expect(await confirmImport(db, scope, importId, { overrides: [] })).toEqual({
    ok: false,
    status: 400,
    error: 'This import is already confirmed.',
  })

  // A second, real Household in the same database — the cross-tenant read
  // the HTTP seam can't set up (ADR 0004 locks sign-up after the first
  // User). The foreign Import reads as not found, not forbidden.
  const other = await seedLedger(db)
  const otherScope = { householdId: other.householdId, userId: other.userId }
  const foreign = await seedImport(db, scope, accountId)
  expect(await confirmImport(db, otherScope, foreign, { overrides: [] })).toEqual({
    ok: false,
    status: 404,
    error: 'Import not found.',
  })
})

test('two racing confirms: exactly one wins, the ledger receives the batch once', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId } = await seedLedger(db)
  const scope = { householdId, userId }
  const importId = await seedImport(db, scope, accountId)

  const [first, second] = await Promise.all([
    confirmImport(db, scope, importId, { overrides: [] }),
    confirmImport(db, scope, importId, { overrides: [] }),
  ])
  const outcomes = [first, second]
  expect(outcomes.filter((result) => result.ok)).toHaveLength(1)
  expect(outcomes.filter((result) => !result.ok)).toMatchObject([
    { status: 400, error: 'This import is already confirmed.' },
  ])
  // Whole-batch atomicity via the deterministic ids: the loser rolled back
  // entirely, so Coffee and Salary each landed exactly once.
  expect(await db.select().from(transaction)).toHaveLength(2)
})

test('an unexplained batch failure rolls back whole and is rethrown, never absorbed', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId } = await seedLedger(db)
  const scope = { householdId, userId }
  const importId = await seedImport(db, scope, accountId)
  // A colliding row with the import still unconfirmed is NOT the known race
  // (the winner would have stamped confirmedAt), so the verb must rethrow.
  await db.insert(transaction).values({
    id: `${importId}:2`,
    accountId,
    date: '2026-01-01',
    amount: 1,
    description: 'Squatter',
    kind: 'standard',
    createdBy: userId,
    createdAt: new Date(),
  })

  await expect(confirmImport(db, scope, importId, { overrides: [] })).rejects.toThrow()
  // The batch rolled back whole: no Salary row, no confirmation stamp.
  expect(await db.select().from(transaction)).toHaveLength(1)
  const [row] = await db.select().from(csvImport).where(eq(csvImport.id, importId))
  expect(row?.confirmedAt).toBeNull()
})

test('chunkRows respects the D1 parameter cap and a long confirm lands every chunk', async () => {
  expect(chunkRows([])).toEqual([])
  const twenty = Array.from({ length: 20 }, (_, i) => i)
  const chunks = chunkRows(twenty)
  expect(chunks.map((chunk) => chunk.length)).toEqual([8, 8, 4])
  expect(chunks.flat()).toEqual(twenty)

  const db = await createTestDb()
  const { householdId, userId, accountId } = await seedLedger(db)
  const scope = { householdId, userId }
  const lines = Array.from(
    { length: 20 },
    (_, i) => `2026-01-${String(i + 1).padStart(2, '0')},Row ${i + 1},-1.00`,
  )
  const importId = await seedImport(db, scope, accountId, {
    csv: `date,desc,amount\n${lines.join('\n')}\n`,
  })
  const result = await confirmImport(db, scope, importId, { overrides: [] })
  expect(result).toMatchObject({ ok: true, value: { createdCount: 20 } })
  expect(await db.select().from(transaction)).toHaveLength(20)
})
