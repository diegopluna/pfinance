import { category, csvImport, invite, member, type Db } from '@pfinance/db'
import { expect, test } from 'vite-plus/test'
import { setCategoryArchived } from '../src/categories.ts'
import { setAccountArchived } from '../src/accounts.ts'
import { findImport, householdCurrency, listImports, loadImport } from '../src/imports.ts'
import { monthlyIncomeExpense } from '../src/income-expense.ts'
import { monthlyNetWorthSeries } from '../src/net-worth.ts'
import { owned, requireAccount, requireCategory, type Scope } from '../src/scope.ts'
import { spendingByCategory } from '../src/spending.ts'
import { createTransaction, findTransaction, listTransactions } from '../src/transactions.ts'
import { createTransfer, findTransfer } from '../src/transfers.ts'
import { createTestDb, seedLedger } from './db-harness.ts'

// --- Household isolation matrix ---
// The tenancy invariant, proven with two REAL Households in one database:
// everything Household B owns must be invisible to Household A's Scope, per
// entity and per mechanism (scope.ts). The HTTP suite structurally cannot
// run these — ADR 0004's sign-up lock means a scratch instance can never
// hold a second Household. No HTTP, no deploy — in-process.

interface Tenant {
  scope: Scope
  accountId: string
  otherAccountId: string
  categoryId: string
  transactionId: string
  transferId: string
  importId: string
  inviteId: string
}

// Two Households, each with a Category, a categorized Expense, a Transfer,
// a pending Import, and a pending Invite. Distinct currencies so the
// household read proves scoping too.
const twoHouseholds = async (db: Db): Promise<{ a: Tenant; b: Tenant }> => {
  const tenants: Tenant[] = []
  for (const currency of ['USD', 'EUR']) {
    const { householdId, userId, accountId, otherAccountId } = await seedLedger(db, { currency })
    const scope = { householdId, userId }
    const categoryId = crypto.randomUUID()
    await db.insert(category).values({
      id: categoryId,
      householdId,
      name: 'Groceries',
      createdAt: new Date(),
    })
    const created = await createTransaction(db, scope, {
      accountId,
      date: '2026-03-05',
      amount: -700,
      description: 'Market',
      kind: 'standard',
      categoryId,
    })
    if (!created.ok) throw new Error(created.error)
    const transfer = await createTransfer(db, scope, {
      fromAccountId: accountId,
      toAccountId: otherAccountId,
      amount: 1000,
      date: '2026-03-06',
      description: 'Stash',
    })
    if (!transfer.ok) throw new Error(transfer.error)
    const importId = crypto.randomUUID()
    await db.insert(csvImport).values({
      id: importId,
      accountId,
      fileName: 'statement.csv',
      csv: 'date,desc,amount\n2026-03-07,Row,-1.00\n',
      mapping: null,
      rowCount: 1,
      createdBy: userId,
      createdAt: new Date(),
    })
    const inviteId = crypto.randomUUID()
    await db.insert(invite).values({
      id: inviteId,
      token: crypto.randomUUID(),
      householdId,
      createdBy: userId,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    })
    tenants.push({
      scope,
      accountId,
      otherAccountId,
      categoryId,
      transactionId: created.value.id,
      transferId: transfer.value.id,
      importId,
      inviteId,
    })
  }
  const [a, b] = tenants
  if (a === undefined || b === undefined) throw new Error('seeding failed')
  return { a, b }
}

test('Ledger reads: B’s Transactions, Transfers, and Imports are invisible to A', async () => {
  const db = await createTestDb()
  const { a, b } = await twoHouseholds(db)

  // Each Household sees exactly its own ledger (3 rows: expense + 2 legs).
  expect(await listTransactions(db, a.scope, {})).toHaveLength(3)
  expect(await listTransactions(db, b.scope, {})).toHaveLength(3)

  expect(await findTransaction(db, a.scope, b.transactionId)).toBeUndefined()
  expect(await findTransfer(db, a.scope, b.transferId)).toBeUndefined()
  expect(await findImport(db, a.scope, b.importId)).toBeUndefined()
  expect(await loadImport(db, a.scope, b.importId)).toBeUndefined()
  expect(await listImports(db, a.scope)).toHaveLength(1)
  // And the same holds with the roles swapped.
  expect(await findTransaction(db, b.scope, a.transactionId)).toBeUndefined()
  expect(await findTransfer(db, b.scope, a.transferId)).toBeUndefined()
  expect(await findImport(db, b.scope, a.importId)).toBeUndefined()
})

test('Guards: a foreign Account or Category reads as unknown, not forbidden', async () => {
  const db = await createTestDb()
  const { a, b } = await twoHouseholds(db)

  expect(await requireAccount(db, a.scope, a.accountId)).toBe(true)
  expect(await requireAccount(db, a.scope, b.accountId)).toBe(false)
  expect(await requireCategory(db, a.scope, a.categoryId)).toBeUndefined()
  expect(await requireCategory(db, a.scope, b.categoryId)).toBe('Unknown category.')
})

test('Archive helpers: A cannot flip B’s Account or Category state', async () => {
  const db = await createTestDb()
  const { a, b } = await twoHouseholds(db)

  expect(await setAccountArchived(db, a.scope, b.accountId, true)).toBeUndefined()
  expect(await setCategoryArchived(db, a.scope, b.categoryId, true)).toBeUndefined()
  // B's rows are untouched — reachable and unarchived under B's own Scope.
  const bAccount = await setAccountArchived(db, b.scope, b.accountId, false)
  expect(bAccount?.archivedAt ?? null).toBeNull()
  const bCategory = await setCategoryArchived(db, b.scope, b.categoryId, false)
  expect(bCategory?.archivedAt ?? null).toBeNull()
})

test('Chart aggregates: B’s money never appears in A’s series', async () => {
  const db = await createTestDb()
  const { a, b } = await twoHouseholds(db)

  // A's Net Worth reflects only A's ledger: -700 (the Transfer nets to 0).
  const aSeries = await monthlyNetWorthSeries(db, a.scope, '2026-03')
  expect(aSeries.at(-1)?.netWorth).toBe(-700)
  const bSeries = await monthlyNetWorthSeries(db, b.scope, '2026-03')
  expect(bSeries.at(-1)?.netWorth).toBe(-700)

  const aSpending = await spendingByCategory(db, a.scope, '2026-03')
  expect(aSpending).toEqual([{ categoryId: a.categoryId, name: 'Groceries', total: 700 }])

  const aMonths = await monthlyIncomeExpense(db, a.scope, '2026-03')
  expect(aMonths.at(-1)).toMatchObject({ month: '2026-03', expense: 700, income: 0 })

  // The household read itself is scoped: each side keeps its own currency.
  expect(await householdCurrency(db, a.scope)).toBe('USD')
  expect(await householdCurrency(db, b.scope)).toBe('EUR')
})

test('owned.* builders: Members and Invites filter to the Scope’s Household', async () => {
  const db = await createTestDb()
  const { a, b } = await twoHouseholds(db)

  const aMembers = await db.select().from(member).where(owned.member(a.scope))
  expect(aMembers).toHaveLength(1)
  expect(aMembers[0]?.householdId).toBe(a.scope.householdId)

  const aInvites = await db.select().from(invite).where(owned.invite(a.scope))
  expect(aInvites.map((row) => row.id)).toEqual([a.inviteId])
  expect(aInvites.map((row) => row.id)).not.toContain(b.inviteId)

  // (owned.ledger is meaningful only joined through account — the full
  // mechanism is pinned via listTransactions above; here, the direct ones.)
  const aCategories = await db.select().from(category).where(owned.category(a.scope))
  expect(aCategories.map((row) => row.householdId)).toEqual([a.scope.householdId])
})
