import { category, csvImport, transaction, transfer, type Db } from '@pfinance/db'
import { asc, eq } from 'drizzle-orm'
import { expect, test } from 'vite-plus/test'
import { chunkRows, confirmImport, type ImportMapping } from '../src/imports.ts'
import type { Scope } from '../src/scope.ts'
import { createTransaction, deleteTransaction, updateTransaction } from '../src/transactions.ts'
import { createTransfer, deleteTransfer, updateTransfer } from '../src/transfers.ts'
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

// --- createTransfer / updateTransfer / deleteTransfer ---

test('createTransfer mints mirrored legs and views the pair', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId, otherAccountId } = await seedLedger(db)
  const scope = { householdId, userId }

  const result = await createTransfer(db, scope, {
    fromAccountId: accountId,
    toAccountId: otherAccountId,
    amount: 2500,
    date: '2026-02-01',
    description: 'Card payoff',
  })
  expect(result).toMatchObject({
    ok: true,
    value: {
      fromAccountId: accountId,
      toAccountId: otherAccountId,
      amount: 2500,
      date: '2026-02-01',
      description: 'Card payoff',
    },
  })
  const legs = await db.select().from(transaction)
  expect(legs).toHaveLength(2)
  // The sign convention carries the direction; everything else mirrors.
  expect(legs.map((leg) => leg.amount).sort((a, b) => a - b)).toEqual([-2500, 2500])
  expect(new Set(legs.map((leg) => leg.kind))).toEqual(new Set(['transfer']))
  expect(new Set(legs.map((leg) => leg.transferId))).toEqual(
    new Set([result.ok ? result.value.id : '']),
  )
})

test('createTransfer rejects an Account outside the Household — including a real foreign one', async () => {
  const db = await createTestDb()
  const mine = await seedLedger(db)
  const theirs = await seedLedger(db)
  const scope = { householdId: mine.householdId, userId: mine.userId }

  // A genuine Account of another Household reads as unknown, not forbidden.
  const result = await createTransfer(db, scope, {
    fromAccountId: mine.accountId,
    toAccountId: theirs.accountId,
    amount: 100,
    date: '2026-02-01',
    description: 'Exfiltration',
  })
  expect(result).toEqual({ ok: false, status: 400, error: 'Unknown account.' })
  expect(await db.select().from(transaction)).toHaveLength(0)
})

test('updateTransfer keeps the legs mirrored and returns the re-read pair', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId, otherAccountId } = await seedLedger(db)
  const scope = { householdId, userId }
  const created = await createTransfer(db, scope, {
    fromAccountId: accountId,
    toAccountId: otherAccountId,
    amount: 2500,
    date: '2026-02-01',
    description: 'Card payoff',
  })
  if (!created.ok) throw new Error(created.error)

  const updated = await updateTransfer(db, scope, created.value.id, { amount: 900 })
  expect(updated).toMatchObject({
    ok: true,
    // The view reflects the ledger after the write — real legs, not a merge.
    value: { amount: 900, date: '2026-02-01', description: 'Card payoff' },
  })
  const legs = await db.select().from(transaction)
  expect(legs.map((leg) => leg.amount).sort((a, b) => a - b)).toEqual([-900, 900])
})

test('updateTransfer holds the two-different-accounts rule on the merged result', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId, otherAccountId } = await seedLedger(db)
  const scope = { householdId, userId }
  const created = await createTransfer(db, scope, {
    fromAccountId: accountId,
    toAccountId: otherAccountId,
    amount: 2500,
    date: '2026-02-01',
    description: 'Card payoff',
  })
  if (!created.ok) throw new Error(created.error)

  // The patch names only one side, but collapsing onto the stored other
  // side must still be caught.
  expect(
    await updateTransfer(db, scope, created.value.id, { fromAccountId: otherAccountId }),
  ).toEqual({
    ok: false,
    status: 400,
    error: 'A transfer needs two different accounts.',
  })
})

test('a foreign Household cannot see, edit, or delete a Transfer', async () => {
  const db = await createTestDb()
  const mine = await seedLedger(db)
  const theirs = await seedLedger(db)
  const scope = { householdId: mine.householdId, userId: mine.userId }
  const otherScope = { householdId: theirs.householdId, userId: theirs.userId }
  const created = await createTransfer(db, scope, {
    fromAccountId: mine.accountId,
    toAccountId: mine.otherAccountId,
    amount: 2500,
    date: '2026-02-01',
    description: 'Card payoff',
  })
  if (!created.ok) throw new Error(created.error)

  const notFound = { ok: false, status: 404, error: 'Transfer not found.' }
  expect(await updateTransfer(db, otherScope, created.value.id, { amount: 1 })).toEqual(notFound)
  expect(await deleteTransfer(db, otherScope, created.value.id)).toEqual(notFound)
  // Untouched: both legs still on my ledger.
  expect(await db.select().from(transaction)).toHaveLength(2)
})

test('deleteTransfer removes the entity and both legs atomically', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId, otherAccountId } = await seedLedger(db)
  const scope = { householdId, userId }
  const created = await createTransfer(db, scope, {
    fromAccountId: accountId,
    toAccountId: otherAccountId,
    amount: 2500,
    date: '2026-02-01',
    description: 'Card payoff',
  })
  if (!created.ok) throw new Error(created.error)

  expect(await deleteTransfer(db, scope, created.value.id)).toEqual({ ok: true, value: null })
  expect(await db.select().from(transaction)).toHaveLength(0)
  expect(await db.select().from(transfer)).toHaveLength(0)
})

// --- createTransaction / updateTransaction / deleteTransaction ---

const FIELDS = {
  date: '2026-03-01',
  amount: -1200,
  description: 'Groceries',
  kind: 'standard' as const,
  categoryId: null,
}

test('createTransaction pins the manual-entry invariants and views the row with attribution', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId } = await seedLedger(db)
  const scope = { householdId, userId }

  const result = await createTransaction(db, scope, { accountId, ...FIELDS })
  expect(result).toMatchObject({
    ok: true,
    value: {
      accountId,
      amount: -1200,
      description: 'Groceries',
      kind: 'standard',
      categoryId: null,
      // Never a leg, never Import-born, attributed by name via the join.
      transferId: null,
      importId: null,
      counterpartAccountId: null,
      enteredBy: 'Tester',
    },
  })
})

test('createTransaction rejects a foreign Account and a foreign or archived Category', async () => {
  const db = await createTestDb()
  const mine = await seedLedger(db)
  const theirs = await seedLedger(db)
  const scope = { householdId: mine.householdId, userId: mine.userId }

  expect(await createTransaction(db, scope, { accountId: theirs.accountId, ...FIELDS })).toEqual({
    ok: false,
    status: 400,
    error: 'Unknown account.',
  })

  const archivedId = crypto.randomUUID()
  const foreignId = crypto.randomUUID()
  await db.insert(category).values([
    {
      id: archivedId,
      householdId: mine.householdId,
      name: 'Retired',
      archivedAt: new Date(),
      createdAt: new Date(),
    },
    {
      id: foreignId,
      householdId: theirs.householdId,
      name: 'Their label',
      createdAt: new Date(),
    },
  ])
  expect(
    await createTransaction(db, scope, {
      accountId: mine.accountId,
      ...FIELDS,
      categoryId: archivedId,
    }),
  ).toEqual({
    ok: false,
    status: 400,
    error: 'That category is archived; unarchive it to assign it.',
  })
  // A foreign Category reads as unknown, not forbidden.
  expect(
    await createTransaction(db, scope, {
      accountId: mine.accountId,
      ...FIELDS,
      categoryId: foreignId,
    }),
  ).toEqual({ ok: false, status: 400, error: 'Unknown category.' })
})

test('a row already carrying an archived Category stays editable; naming it anew does not', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId } = await seedLedger(db)
  const scope = { householdId, userId }
  const archivedId = crypto.randomUUID()
  await db.insert(category).values({
    id: archivedId,
    householdId,
    name: 'Retired',
    archivedAt: new Date(),
    createdAt: new Date(),
  })
  // The row predates the archiving (inserted directly — the create verb
  // would rightly refuse).
  const rowId = crypto.randomUUID()
  await db.insert(transaction).values({
    id: rowId,
    accountId,
    date: '2026-03-01',
    amount: -1200,
    description: 'Groceries',
    kind: 'standard',
    categoryId: archivedId,
    createdBy: userId,
    createdAt: new Date(),
  })

  // A full-field resubmit (the web form's shape) re-asserts the current
  // Category — that is not an assignment, so the row stays editable.
  const resubmit = await updateTransaction(db, scope, rowId, {
    amount: -1500,
    categoryId: archivedId,
  })
  expect(resubmit).toMatchObject({ ok: true, value: { amount: -1500, categoryId: archivedId } })

  // A second row newly naming the archived Category is an assignment.
  const otherRowId = crypto.randomUUID()
  await db.insert(transaction).values({
    id: otherRowId,
    accountId,
    date: '2026-03-02',
    amount: -100,
    description: 'Snacks',
    kind: 'standard',
    createdBy: userId,
    createdAt: new Date(),
  })
  expect(await updateTransaction(db, scope, otherRowId, { categoryId: archivedId })).toEqual({
    ok: false,
    status: 400,
    error: 'That category is archived; unarchive it to assign it.',
  })
})

test('Transfer legs are immutable through the Transaction verbs', async () => {
  const db = await createTestDb()
  const { householdId, userId, accountId, otherAccountId } = await seedLedger(db)
  const scope = { householdId, userId }
  const created = await createTransfer(db, scope, {
    fromAccountId: accountId,
    toAccountId: otherAccountId,
    amount: 2500,
    date: '2026-02-01',
    description: 'Card payoff',
  })
  if (!created.ok) throw new Error(created.error)
  const [leg] = await db.select().from(transaction).limit(1)
  if (leg === undefined) throw new Error('no leg')

  expect(await updateTransaction(db, scope, leg.id, { amount: 1 })).toEqual({
    ok: false,
    status: 400,
    error: 'Transfer legs are edited through their transfer.',
  })
  expect(await deleteTransaction(db, scope, leg.id)).toEqual({
    ok: false,
    status: 400,
    error: 'Transfer legs are deleted through their transfer.',
  })
  expect(await db.select().from(transaction)).toHaveLength(2)
})

test('a foreign Household cannot edit or delete a Transaction', async () => {
  const db = await createTestDb()
  const mine = await seedLedger(db)
  const theirs = await seedLedger(db)
  const scope = { householdId: mine.householdId, userId: mine.userId }
  const otherScope = { householdId: theirs.householdId, userId: theirs.userId }
  const created = await createTransaction(db, scope, { accountId: mine.accountId, ...FIELDS })
  if (!created.ok) throw new Error(created.error)

  const notFound = { ok: false, status: 404, error: 'Transaction not found.' }
  expect(await updateTransaction(db, otherScope, created.value.id, { amount: 1 })).toEqual(notFound)
  expect(await deleteTransaction(db, otherScope, created.value.id)).toEqual(notFound)
  expect(await db.select().from(transaction)).toHaveLength(1)

  expect(await deleteTransaction(db, scope, created.value.id)).toEqual({ ok: true, value: null })
  expect(await db.select().from(transaction)).toHaveLength(0)
})
