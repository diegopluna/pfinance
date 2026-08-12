import { account, transaction, transfer, type Db } from '@pfinance/db'
import { and, eq } from 'drizzle-orm'
import type { Parsed, VerbResult } from './parsed.ts'
import { ledgerAccountJoin, owned, requireAccount, type Scope } from './scope.ts'
import { isCalendarDate, parseDescription } from './transactions.ts'

// Parsing and shaping for the /api/transfers surface (issue #12). A Transfer
// is a single entity linking an outflow leg on one Account to an inflow leg
// on another (CONTEXT.md): its editable state is { fromAccountId,
// toAccountId, amount, date, description }, projected onto two mirrored
// Transaction rows. Direction is structural — from and to — so the amount is
// always positive and the legs carry the signs.

export interface TransferFields {
  fromAccountId: string
  toAccountId: string
  // Positive integer minor units (ADR 0006): the outflow leg stores -amount,
  // the inflow leg +amount.
  amount: number
  date: string
  description: string
}

// What both legs read when no description is sent: a Transfer explains
// itself, unlike a Transaction, whose description is its only meaning.
const DEFAULT_DESCRIPTION = 'Transfer'

const parseTransferAccountId = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined

const parseTransferAmount = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined

// Absent and blank both mean the default label; anything else must be text
// with something in it, never coerced.
const parseTransferDescription = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return DEFAULT_DESCRIPTION
  if (typeof value !== 'string') return undefined
  return parseDescription(value) ?? DEFAULT_DESCRIPTION
}

export const parseNewTransfer = (body: unknown): Parsed<TransferFields> => {
  const record = (body ?? {}) as Record<string, unknown>
  const fromAccountId = parseTransferAccountId(record.fromAccountId)
  if (fromAccountId === undefined) return { ok: false, error: 'A transfer needs a from-account.' }
  const toAccountId = parseTransferAccountId(record.toAccountId)
  if (toAccountId === undefined) return { ok: false, error: 'A transfer needs a to-account.' }
  if (fromAccountId === toAccountId) {
    return { ok: false, error: 'A transfer needs two different accounts.' }
  }
  const amount = parseTransferAmount(record.amount)
  if (amount === undefined) {
    return { ok: false, error: 'Amount must be a positive integer in minor units.' }
  }
  if (!isCalendarDate(record.date)) {
    return { ok: false, error: 'Date must be a calendar date like 2026-01-15.' }
  }
  const description = parseTransferDescription(record.description)
  if (description === undefined) return { ok: false, error: 'Description must be text.' }
  return { ok: true, value: { fromAccountId, toAccountId, amount, date: record.date, description } }
}

// PATCH accepts any subset of the editable fields — but at least one, like
// the Transaction patch. When only one Account side is named, the collision
// with the other side can only be judged against the stored pair, so the
// route checks the merged result; a body naming both sides equal fails here.
export const parseTransferPatch = (body: unknown): Parsed<Partial<TransferFields>> => {
  const record = (body ?? {}) as Record<string, unknown>
  const patch: Partial<TransferFields> = {}
  if ('fromAccountId' in record) {
    const fromAccountId = parseTransferAccountId(record.fromAccountId)
    if (fromAccountId === undefined) return { ok: false, error: 'A transfer needs a from-account.' }
    patch.fromAccountId = fromAccountId
  }
  if ('toAccountId' in record) {
    const toAccountId = parseTransferAccountId(record.toAccountId)
    if (toAccountId === undefined) return { ok: false, error: 'A transfer needs a to-account.' }
    patch.toAccountId = toAccountId
  }
  if (patch.fromAccountId !== undefined && patch.fromAccountId === patch.toAccountId) {
    return { ok: false, error: 'A transfer needs two different accounts.' }
  }
  if ('amount' in record) {
    const amount = parseTransferAmount(record.amount)
    if (amount === undefined) {
      return { ok: false, error: 'Amount must be a positive integer in minor units.' }
    }
    patch.amount = amount
  }
  if ('date' in record) {
    if (!isCalendarDate(record.date)) {
      return { ok: false, error: 'Date must be a calendar date like 2026-01-15.' }
    }
    patch.date = record.date
  }
  if ('description' in record) {
    const description = parseTransferDescription(record.description)
    if (description === undefined) return { ok: false, error: 'Description must be text.' }
    patch.description = description
  }
  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      error: 'Nothing to update: send fromAccountId, toAccountId, amount, date, or description.',
    }
  }
  return { ok: true, value: patch }
}

// The API shape of a Transfer, reassembled from its legs: the inflow leg
// carries the positive amount and the shared date/description verbatim.
export const transferView = (
  id: string,
  outflow: { accountId: string },
  inflow: { accountId: string; amount: number; date: string; description: string; createdAt: Date },
) => ({
  id,
  fromAccountId: outflow.accountId,
  toAccountId: inflow.accountId,
  amount: inflow.amount,
  date: inflow.date,
  description: inflow.description,
  createdAt: inflow.createdAt,
})

// Fetch a Transfer's legs scoped to the caller's Household, keyed by
// direction (the sign identifies each: amount is never zero). Both legs share
// one Household — enforced on every write — so scoping through the legs'
// Accounts is scoping the Transfer; anything but the intact pair reads as
// not found.
export const findTransfer = async (db: Db, scope: Scope, id: string) => {
  const legs = await db
    .select({
      id: transaction.id,
      accountId: transaction.accountId,
      amount: transaction.amount,
      date: transaction.date,
      description: transaction.description,
      createdAt: transaction.createdAt,
    })
    .from(transaction)
    .innerJoin(account, ledgerAccountJoin)
    .where(and(eq(transaction.transferId, id), owned.ledger(scope)))
  const outflow = legs.find((leg) => leg.amount < 0)
  const inflow = legs.find((leg) => leg.amount > 0)
  if (legs.length !== 2 || outflow === undefined || inflow === undefined) return undefined
  return { outflow, inflow }
}

export type TransferView = ReturnType<typeof transferView>

/**
 * The create write path (issue #12): both Accounts verified against the
 * Household, legs minted with the sign convention (outflow −amount, inflow
 * +amount), and the entity plus both legs landed in one atomic batch — the
 * pair can never drift because no caller ever writes one leg alone.
 */
export const createTransfer = async (
  db: Db,
  scope: Scope,
  fields: TransferFields,
): Promise<VerbResult<TransferView>> => {
  for (const accountId of [fields.fromAccountId, fields.toAccountId]) {
    if (!(await requireAccount(db, scope, accountId))) {
      return { ok: false, status: 400, error: 'Unknown account.' }
    }
  }
  const id = crypto.randomUUID()
  const shared = {
    date: fields.date,
    description: fields.description,
    kind: 'transfer' as const,
    categoryId: null,
    transferId: id,
    importId: null,
    createdBy: scope.userId,
    createdAt: new Date(),
  }
  const outflow = {
    id: crypto.randomUUID(),
    accountId: fields.fromAccountId,
    amount: -fields.amount,
    ...shared,
  }
  const inflow = {
    id: crypto.randomUUID(),
    accountId: fields.toAccountId,
    amount: fields.amount,
    ...shared,
  }
  // One atomic batch: the entity and both legs land together or not at all.
  await db.batch([
    db.insert(transfer).values({ id, createdAt: shared.createdAt }),
    db.insert(transaction).values([outflow, inflow]),
  ])
  return { ok: true, value: transferView(id, outflow, inflow) }
}

/**
 * The patch write path: any subset of the editable fields, judged against
 * the stored pair (a patch naming only one Account side can still collapse
 * the pair onto one Account), then both legs rewritten in one atomic batch,
 * mirrored by construction — same date and description, opposite signs.
 */
export const updateTransfer = async (
  db: Db,
  scope: Scope,
  id: string,
  patch: Partial<TransferFields>,
): Promise<VerbResult<TransferView>> => {
  const found = await findTransfer(db, scope, id)
  if (found === undefined) {
    return { ok: false, status: 404, error: 'Transfer not found.' }
  }
  const fromAccountId = patch.fromAccountId ?? found.outflow.accountId
  const toAccountId = patch.toAccountId ?? found.inflow.accountId
  if (fromAccountId === toAccountId) {
    return { ok: false, status: 400, error: 'A transfer needs two different accounts.' }
  }
  for (const accountId of [patch.fromAccountId, patch.toAccountId]) {
    if (accountId !== undefined && !(await requireAccount(db, scope, accountId))) {
      return { ok: false, status: 400, error: 'Unknown account.' }
    }
  }
  const amount = patch.amount ?? found.inflow.amount
  const date = patch.date ?? found.inflow.date
  const description = patch.description ?? found.inflow.description
  await db.batch([
    db
      .update(transaction)
      .set({ accountId: fromAccountId, amount: -amount, date, description })
      .where(eq(transaction.id, found.outflow.id)),
    db
      .update(transaction)
      .set({ accountId: toAccountId, amount, date, description })
      .where(eq(transaction.id, found.inflow.id)),
  ])
  // Viewed from the re-read legs, never a hand-assembled merge: what the
  // caller sees is what the ledger now holds.
  const updated = await findTransfer(db, scope, id)
  if (updated === undefined) {
    return { ok: false, status: 404, error: 'Transfer not found.' }
  }
  return { ok: true, value: transferView(id, updated.outflow, updated.inflow) }
}

/**
 * The delete write path: one DELETE on the entity — the legs' transferId
 * cascades, so both legs go with it atomically (deleting one leg alone is
 * impossible here by construction, issue #12).
 */
export const deleteTransfer = async (
  db: Db,
  scope: Scope,
  id: string,
): Promise<VerbResult<null>> => {
  const found = await findTransfer(db, scope, id)
  if (found === undefined) {
    return { ok: false, status: 404, error: 'Transfer not found.' }
  }
  await db.delete(transfer).where(eq(transfer.id, id))
  return { ok: true, value: null }
}
