import { account } from '@pfinance/db'
import { expect, test } from 'vite-plus/test'
import { parseNewAccount } from '../src/accounts.ts'
import { monthlyNetWorthSeries } from '../src/net-worth.ts'
import { createTransaction } from '../src/transactions.ts'
import { createTestDb, seedLedger } from './db-harness.ts'

// --- Liability sign is user-carried (ADR 0001, issue #50) ---
// Net Worth never flips sign by Account kind: a liability counts negatively
// only because its Balance is entered negative. These tests pin both faces
// of that decision — including the one the aggregate cannot tell apart from
// a mistake: a liability entered positive RAISES Net Worth, deliberately.
// A positive liability Balance is a real state (an overpaid credit card),
// so the API stays permissive and the account form guides the sign instead.
// No HTTP, no deploy — in-process against the db-harness.

// A Household with the harness's two zero-balance asset Accounts plus a
// credit card opened at the given balance.
const householdWithCard = async (openingBalance: number) => {
  const db = await createTestDb()
  const { householdId, userId } = await seedLedger(db)
  const cardId = crypto.randomUUID()
  await db.insert(account).values({
    id: cardId,
    householdId,
    name: 'Visa',
    type: 'credit_card',
    openingBalance,
    archivedAt: null,
    createdAt: new Date(),
  })
  return { db, scope: { householdId, userId }, cardId }
}

test('a liability Account entered with a positive opening balance raises Net Worth', async () => {
  // "I owe 500" typed without the minus: the plain sum takes it at face
  // value, so Net Worth reads +50000, not −50000. This is the blessed
  // behavior, not a bug — sign is user-carried, never inferred from kind.
  const { db, scope } = await householdWithCard(50000)
  const series = await monthlyNetWorthSeries(db, scope, '2026-03')
  expect(series).toEqual([{ month: '2026-03', netWorth: 50000 }])
})

test('the same debt entered by the convention pulls Net Worth down', async () => {
  const { db, scope, cardId } = await householdWithCard(-50000)
  // Card spending is a negative Transaction (an Expense), deepening the debt.
  const spent = await createTransaction(db, scope, {
    accountId: cardId,
    date: '2026-01-10',
    amount: -30000,
    description: 'Flights',
    kind: 'standard',
    categoryId: null,
  })
  expect(spent.ok).toBe(true)
  const series = await monthlyNetWorthSeries(db, scope, '2026-03')
  expect(series.at(-1)).toEqual({ month: '2026-03', netWorth: -80000 })
})

test('the write boundary accepts either sign for a liability opening balance', () => {
  // Coercing or rejecting by kind was considered and declined (issue #50):
  // overpayment makes a positive liability Balance legitimate. The catch-all
  // liability (issue #51) rides the same policy as credit cards and loans.
  for (const [type, name] of [
    ['credit_card', 'Visa'],
    ['other_liability', 'IOU to Mom'],
  ]) {
    for (const openingBalance of [50000, -50000]) {
      const parsed = parseNewAccount({ name, type, openingBalance })
      expect(parsed).toMatchObject({ ok: true, value: { type, openingBalance } })
    }
  }
})
