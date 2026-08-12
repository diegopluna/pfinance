import { transaction, transfer } from '@pfinance/db'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vite-plus/test'
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
