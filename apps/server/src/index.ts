import {
  account,
  category,
  createDb,
  csvImport,
  household,
  invite,
  member,
  meta,
  transaction,
  transfer,
  user,
} from '@pfinance/db'
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import { validator } from 'hono/validator'
import type { ServerEnv } from './env.ts'
import {
  accountView,
  ledgerSum,
  ledgerSumExpr,
  parseAccountPatch,
  parseNewAccount,
  setAccountArchived,
} from './accounts.ts'
import { createAuth } from './auth.ts'
import {
  categoryOrder,
  categoryView,
  ensureSeededCategories,
  parseCategoryFields,
  setCategoryArchived,
} from './categories.ts'
import { parseHouseholdPatch } from './household.ts'
import {
  findInvite,
  generateInviteToken,
  INVITE_DEFAULT_TTL_SECONDS,
  INVITE_MAX_TTL_SECONDS,
  pendingInviteFilter,
} from './invites.ts'
import {
  findImport,
  flaggedPreviewRows,
  householdCurrency,
  IMPORT_INSERT_CHUNK,
  IMPORT_MAX_ROWS,
  importView,
  listImports,
  mappingColumnError,
  parseCsv,
  parseImportConfirm,
  parseImportMapping,
  parseNewImport,
  type ImportMapping,
} from './imports.ts'
import { monthlyIncomeExpense } from './income-expense.ts'
import { currentUtcMonth, isCalendarMonth, monthlyNetWorthSeries } from './net-worth.ts'
import { matchesTrustedOrigin, trustedOrigins } from './origins.ts'
import { selfServeSignUpAllowed } from './signup-gate.ts'
import { spendingByCategory } from './spending.ts'
import {
  accountInHousehold,
  categoryAssignmentError,
  findTransaction,
  listTransactions,
  parseNewTransaction,
  parseTransactionFilters,
  parseTransactionPatch,
  transactionView,
} from './transactions.ts'
import { findTransfer, parseNewTransfer, parseTransferPatch, transferView } from './transfers.ts'

type SessionUser = { id: string; email: string; name: string }

type Variables = {
  user: SessionUser
  membership: { householdId: string; role: 'owner' | 'member' }
}

const authFor = (c: { env: ServerEnv; req: { url: string } }) =>
  createAuth(c.env, new URL(c.req.url).origin)

// Managing Members and Invites is the owner's alone (issue #6); runs after
// the session middleware below, which resolves c.var.membership.
const ownerGuard = createMiddleware<{ Bindings: ServerEnv; Variables: Variables }>(
  async (c, next) => {
    if (c.var.membership.role !== 'owner') {
      return c.json({ error: 'Only the household owner can manage members and invites.' }, 403)
    }
    await next()
  },
)

// Routes are chained so the accumulated schema type reaches the web app's
// typed client (Hono RPC) via AppType below.
const app = new Hono<{ Bindings: ServerEnv; Variables: Variables }>()
  // The web app calls from its own origin with credentials; reflect only the
  // origins the auth config trusts (see origins.ts).
  .use(
    '*',
    cors({
      origin: (origin, c) =>
        matchesTrustedOrigin(origin, trustedOrigins(c.env)) ? origin : undefined,
      credentials: true,
    }),
  )
  .get('/health', async (c) => {
    const db = createDb(c.env.DB)
    // Querying a migrated table proves the schema was applied to the bound
    // database — the query throws (→ 500) if the migration never ran.
    await db.select({ key: meta.key }).from(meta).limit(1)
    return c.json({ ok: true })
  })
  // Better Auth owns everything under /api/auth/* (sign-up, sign-in,
  // sign-out, get-session). Registered before the session middleware, so it
  // stays public.
  .on(['GET', 'POST'], '/api/auth/*', (c) => authFor(c).handler(c.req.raw))
  // Public: the sign-up screen asks before rendering the form, so a locked
  // instance explains itself instead of failing on submit. The auth hook in
  // auth.ts stays the enforcement point (ADR 0004).
  .get('/api/sign-up-status', async (c) => {
    const db = createDb(c.env.DB)
    return c.json({ allowed: await selfServeSignUpAllowed(db) })
  })
  // Public for the same reason as sign-up-status: the recipient of an Invite
  // link isn't signed in, and the sign-up screen wants to greet them (or
  // explain a dead link) before rendering the form. Redemption itself is
  // enforced in the auth hook regardless.
  .get('/api/invite-info', async (c) => {
    const token = c.req.query('token') ?? ''
    const db = createDb(c.env.DB)
    const found = await findInvite(db, token, new Date())
    if (found.status !== 'pending') {
      return c.json({ valid: false as const, reason: found.status })
    }
    const [householdRow] = await db
      .select({ name: household.name })
      .from(household)
      .where(eq(household.id, found.invite.householdId))
      .limit(1)
    return c.json({ valid: true as const, householdName: householdRow?.name ?? '' })
  })
  // Every other /api route requires a session; the caller's Membership is
  // resolved here so handlers scope all data access to
  // c.var.membership.householdId.
  .use('/api/*', async (c, next) => {
    const sessionData = await authFor(c).api.getSession({ headers: c.req.raw.headers })
    if (!sessionData) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    const db = createDb(c.env.DB)
    const [membership] = await db
      .select({ householdId: member.householdId, role: member.role })
      .from(member)
      .where(eq(member.userId, sessionData.user.id))
      .limit(1)
    if (!membership) {
      // A User without a Membership can't be scoped to any data.
      return c.json({ error: 'Unauthorized' }, 401)
    }
    c.set('user', sessionData.user)
    c.set('membership', membership)
    await next()
  })
  .get('/api/me', async (c) => {
    const db = createDb(c.env.DB)
    const { householdId, role } = c.var.membership
    const [householdRow] = await db
      // currency rides along so clients can format every amount (ADR 0002),
      // dateFormat so they can format every calendar date (issue #31).
      .select({
        id: household.id,
        name: household.name,
        currency: household.currency,
        dateFormat: household.dateFormat,
      })
      .from(household)
      .where(eq(household.id, householdId))
      .limit(1)
    if (!householdRow) {
      return c.json({ error: 'Household not found' }, 500)
    }
    // The shell's identity line ("BRL · 2 members") wants the count, and
    // every Member may see it — unlike the owner-only /api/members list.
    const [memberCountRow] = await db
      .select({ memberCount: count() })
      .from(member)
      .where(eq(member.householdId, householdId))
    const { id, email, name } = c.var.user
    return c.json({
      user: { id, email, name },
      household: { ...householdRow, memberCount: memberCountRow?.memberCount ?? 1 },
      role,
    })
  })
  // --- Household settings (issue #31) — member-level: the preference shapes
  // how the shared ledger reads, and the ledger is every Member's
  // (CONTEXT.md), so no ownerGuard. Presentation only — no stored date is
  // ever rewritten by this.
  .patch(
    '/api/household',
    validator('json', (value, c) => {
      const parsed = parseHouseholdPatch(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const { householdId } = c.var.membership
      const [updated] = await db
        .update(household)
        .set(c.req.valid('json'))
        .where(eq(household.id, householdId))
        .returning({
          id: household.id,
          name: household.name,
          currency: household.currency,
          dateFormat: household.dateFormat,
        })
      if (!updated) {
        return c.json({ error: 'Household not found' }, 500)
      }
      return c.json({ household: updated })
    },
  )
  // --- Accounts (issue #7) — member-level: every Member sees and edits the
  // Household's shared ledger (CONTEXT.md), so no ownerGuard here. Balance is
  // always derived via accountView (ADR 0001), never read from a column.
  // Inputs go through hono/validator wrapping the parse functions in
  // accounts.ts — one validation point that also types the web app's RPC
  // client (hc<AppType>) for these routes.
  .get(
    '/api/accounts',
    // Archived Accounts are hidden by default; ?includeArchived=true is the
    // "show closed accounts" toggle, which keeps their history reachable.
    validator('query', (value) => ({ includeArchived: value.includeArchived === 'true' })),
    async (c) => {
      const db = createDb(c.env.DB)
      const { includeArchived } = c.req.valid('query')
      const rows = await db
        // One grouped query derives every Balance: the ledger sum joins in
        // (ADR 0001), zero for Accounts with no Transactions yet.
        .select({ row: account, ledgerTotal: ledgerSumExpr })
        .from(account)
        .leftJoin(transaction, eq(transaction.accountId, account.id))
        .where(
          and(
            eq(account.householdId, c.var.membership.householdId),
            ...(includeArchived ? [] : [isNull(account.archivedAt)]),
          ),
        )
        .groupBy(account.id)
        // Name breaks the tie within a second so the order is stable.
        .orderBy(asc(account.createdAt), asc(account.name), asc(account.id))
      return c.json({ accounts: rows.map(({ row, ledgerTotal }) => accountView(row, ledgerTotal)) })
    },
  )
  .post(
    '/api/accounts',
    validator('json', (value, c) => {
      const parsed = parseNewAccount(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const row = {
        id: crypto.randomUUID(),
        householdId: c.var.membership.householdId,
        ...c.req.valid('json'),
        archivedAt: null,
        createdAt: new Date(),
      }
      await db.insert(account).values(row)
      // A brand-new Account has no Transactions: the ledger sum is zero.
      return c.json({ account: accountView(row, 0) })
    },
  )
  .patch(
    '/api/accounts/:id',
    validator('json', (value, c) => {
      const parsed = parseAccountPatch(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const [updated] = await db
        .update(account)
        .set(c.req.valid('json'))
        .where(
          and(
            eq(account.id, c.req.param('id')),
            eq(account.householdId, c.var.membership.householdId),
          ),
        )
        .returning()
      if (updated === undefined) {
        return c.json({ error: 'Account not found.' }, 404)
      }
      return c.json({ account: accountView(updated, await ledgerSum(db, updated.id)) })
    },
  )
  // Archiving hides an Account that closed in real life; unarchiving is the
  // undo. Both keep every row — history is never deleted — and both are
  // idempotent via setAccountArchived (a repeat archive keeps the original
  // archivedAt).
  .post('/api/accounts/:id/archive', async (c) => {
    const db = createDb(c.env.DB)
    const row = await setAccountArchived(db, c.var.membership.householdId, c.req.param('id'), true)
    if (row === undefined) {
      return c.json({ error: 'Account not found.' }, 404)
    }
    return c.json({ account: accountView(row, await ledgerSum(db, row.id)) })
  })
  .post('/api/accounts/:id/unarchive', async (c) => {
    const db = createDb(c.env.DB)
    const row = await setAccountArchived(db, c.var.membership.householdId, c.req.param('id'), false)
    if (row === undefined) {
      return c.json({ error: 'Account not found.' }, 404)
    }
    return c.json({ account: accountView(row, await ledgerSum(db, row.id)) })
  })
  // --- Transactions (issue #8) — member-level like Accounts: the ledger is
  // every Member's to read and write (CONTEXT.md). Tenancy rides on the
  // Account: writes verify the target Account belongs to the caller's
  // Household, reads join through it (transactions.ts).
  .get(
    '/api/transactions',
    validator('query', (value, c) => {
      const parsed = parseTransactionFilters(value as Record<string, string | undefined>)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const transactions = await listTransactions(
        db,
        c.var.membership.householdId,
        c.req.valid('query'),
      )
      return c.json({ transactions })
    },
  )
  .post(
    '/api/transactions',
    validator('json', (value, c) => {
      const parsed = parseNewTransaction(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const fields = c.req.valid('json')
      if (!(await accountInHousehold(db, c.var.membership.householdId, fields.accountId))) {
        return c.json({ error: 'Unknown account.' }, 400)
      }
      if (fields.categoryId !== null) {
        const rejection = await categoryAssignmentError(
          db,
          c.var.membership.householdId,
          fields.categoryId,
        )
        if (rejection !== undefined) return c.json({ error: rejection }, 400)
      }
      const row = {
        id: crypto.randomUUID(),
        ...fields,
        // Never a Transfer leg: those are created only through /api/transfers.
        transferId: null,
        // Manual entry — Import-born rows are created only through
        // /api/imports/:id/confirm.
        importId: null,
        createdBy: c.var.user.id,
        createdAt: new Date(),
      }
      await db.insert(transaction).values(row)
      return c.json({ transaction: transactionView(row, c.var.user.name) })
    },
  )
  .patch(
    '/api/transactions/:id',
    validator('json', (value, c) => {
      const parsed = parseTransactionPatch(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const existing = await findTransaction(db, c.var.membership.householdId, c.req.param('id'))
      if (existing === undefined) {
        return c.json({ error: 'Transaction not found.' }, 404)
      }
      // A Transfer leg is not independently editable (issue #12): the pair
      // can never drift, so every change goes through /api/transfers.
      if (existing.transferId !== null) {
        return c.json({ error: 'Transfer legs are edited through their transfer.' }, 400)
      }
      const patch = c.req.valid('json')
      if (
        patch.accountId !== undefined &&
        !(await accountInHousehold(db, c.var.membership.householdId, patch.accountId))
      ) {
        return c.json({ error: 'Unknown account.' }, 400)
      }
      // Guard only a newly named Category (null clears, undefined keeps, and
      // re-asserting the row's current one is not an assignment): a row
      // already carrying an archived Category stays editable — including
      // through clients that resubmit the whole field set, like the web form.
      if (patch.categoryId != null && patch.categoryId !== existing.categoryId) {
        const rejection = await categoryAssignmentError(
          db,
          c.var.membership.householdId,
          patch.categoryId,
        )
        if (rejection !== undefined) return c.json({ error: rejection }, 400)
      }
      await db.update(transaction).set(patch).where(eq(transaction.id, existing.id))
      // enteredBy stays the creator: editing a row doesn't re-attribute it.
      return c.json({ transaction: { ...existing, ...patch } })
    },
  )
  .delete('/api/transactions/:id', async (c) => {
    const db = createDb(c.env.DB)
    const existing = await findTransaction(db, c.var.membership.householdId, c.req.param('id'))
    if (existing === undefined) {
      return c.json({ error: 'Transaction not found.' }, 404)
    }
    // Deleting one leg would leave half a Transfer (issue #12): both legs go
    // together through DELETE /api/transfers/:id.
    if (existing.transferId !== null) {
      return c.json({ error: 'Transfer legs are deleted through their transfer.' }, 400)
    }
    await db.delete(transaction).where(eq(transaction.id, existing.id))
    return c.json({ ok: true })
  })
  // --- Transfers (issue #12) — member-level like the rest of the ledger. A
  // Transfer is one entity whose two legs can never drift: every write lands
  // on both legs in one atomic D1 batch (the auth.ts pattern), and delete
  // cascades from the transfer row itself. Legs are read through
  // /api/transactions like any Transaction and excluded from the
  // Expense/Income views by kind (transactions.ts).
  .post(
    '/api/transfers',
    validator('json', (value, c) => {
      const parsed = parseNewTransfer(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const fields = c.req.valid('json')
      for (const accountId of [fields.fromAccountId, fields.toAccountId]) {
        if (!(await accountInHousehold(db, c.var.membership.householdId, accountId))) {
          return c.json({ error: 'Unknown account.' }, 400)
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
        createdBy: c.var.user.id,
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
      // One atomic D1 transaction: the entity and both legs land together or
      // not at all.
      await db.batch([
        db.insert(transfer).values({ id, createdAt: shared.createdAt }),
        db.insert(transaction).values([outflow, inflow]),
      ])
      return c.json({ transfer: transferView(id, outflow, inflow) })
    },
  )
  .patch(
    '/api/transfers/:id',
    validator('json', (value, c) => {
      const parsed = parseTransferPatch(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const { householdId } = c.var.membership
      const found = await findTransfer(db, householdId, c.req.param('id'))
      if (found === undefined) {
        return c.json({ error: 'Transfer not found.' }, 404)
      }
      const patch = c.req.valid('json')
      // The two-different-accounts rule holds on the merged result: a patch
      // naming only one side can still collapse the pair onto one Account.
      const fromAccountId = patch.fromAccountId ?? found.outflow.accountId
      const toAccountId = patch.toAccountId ?? found.inflow.accountId
      if (fromAccountId === toAccountId) {
        return c.json({ error: 'A transfer needs two different accounts.' }, 400)
      }
      for (const accountId of [patch.fromAccountId, patch.toAccountId]) {
        if (accountId !== undefined && !(await accountInHousehold(db, householdId, accountId))) {
          return c.json({ error: 'Unknown account.' }, 400)
        }
      }
      const amount = patch.amount ?? found.inflow.amount
      const date = patch.date ?? found.inflow.date
      const description = patch.description ?? found.inflow.description
      // Both legs are rewritten in one atomic batch, mirrored by
      // construction: same date and description, opposite signs.
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
      return c.json({
        transfer: transferView(
          c.req.param('id'),
          { accountId: fromAccountId },
          { accountId: toAccountId, amount, date, description, createdAt: found.inflow.createdAt },
        ),
      })
    },
  )
  .delete('/api/transfers/:id', async (c) => {
    const db = createDb(c.env.DB)
    const found = await findTransfer(db, c.var.membership.householdId, c.req.param('id'))
    if (found === undefined) {
      return c.json({ error: 'Transfer not found.' }, 404)
    }
    // The legs' transferId cascades: one DELETE removes the entity and both
    // legs atomically.
    await db.delete(transfer).where(eq(transfer.id, c.req.param('id')))
    return c.json({ ok: true })
  })
  // --- CSV Imports (issue #13) — member-level like the rest of the ledger.
  // An Import is a batch of Transactions from one CSV file into one Account
  // (CONTEXT.md): upload stores the file, preview persists the column
  // mapping and shows every row's fate — malformed rows surfaced, never
  // silently dropped — and confirm re-parses the stored file with the stored
  // mapping, so exactly what was previewed is created. Rows exact-matching
  // an existing Transaction on account + date + amount + description are
  // flagged and skipped by default, overridable per row (issue #14), so
  // overlapping bank exports never double-count the ledger. Tenancy rides on
  // the Account like Transactions (imports.ts). CONTEXT.md's revert is the
  // DELETE (issue #15), riding the import_id cascade.
  .get('/api/imports', async (c) => {
    const db = createDb(c.env.DB)
    return c.json({ imports: await listImports(db, c.var.membership.householdId) })
  })
  .post(
    '/api/imports',
    validator('json', (value, c) => {
      const parsed = parseNewImport(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const fields = c.req.valid('json')
      if (!(await accountInHousehold(db, c.var.membership.householdId, fields.accountId))) {
        return c.json({ error: 'Unknown account.' }, 400)
      }
      const [header, ...data] = parseCsv(fields.csv)
      if (header === undefined || data.length === 0) {
        return c.json({ error: 'The CSV needs a header row and at least one data row.' }, 400)
      }
      if (data.length > IMPORT_MAX_ROWS) {
        return c.json(
          { error: `The file has ${data.length} rows; the limit is ${IMPORT_MAX_ROWS}.` },
          400,
        )
      }
      const row = {
        id: crypto.randomUUID(),
        accountId: fields.accountId,
        fileName: fields.fileName,
        csv: fields.csv,
        mapping: null,
        rowCount: data.length,
        createdCount: null,
        malformedCount: null,
        duplicateCount: null,
        createdBy: c.var.user.id,
        createdAt: new Date(),
        confirmedAt: null,
      }
      await db.insert(csvImport).values(row)
      // The header rides along so the map step can offer the columns.
      return c.json({ import: importView(row), columns: header.cells })
    },
  )
  .get('/api/imports/:id', async (c) => {
    const db = createDb(c.env.DB)
    const found = await findImport(db, c.var.membership.householdId, c.req.param('id'))
    if (found === undefined) {
      return c.json({ error: 'Import not found.' }, 404)
    }
    return c.json({ import: importView(found), columns: parseCsv(found.csv)[0]?.cells ?? [] })
  })
  // The map step: persists the mapping on the pending Import — confirm
  // re-parses the same bytes with the same mapping, so what was last
  // previewed is exactly what confirm creates — and returns every data
  // row's fate, duplicate flags included.
  .post(
    '/api/imports/:id/preview',
    validator('json', (value, c) => {
      const parsed = parseImportMapping(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const { householdId } = c.var.membership
      const found = await findImport(db, householdId, c.req.param('id'))
      if (found === undefined) {
        return c.json({ error: 'Import not found.' }, 404)
      }
      if (found.confirmedAt !== null) {
        return c.json({ error: 'This import is confirmed; its mapping is frozen.' }, 400)
      }
      const mapping = c.req.valid('json')
      const [header, ...data] = parseCsv(found.csv)
      const columnError = mappingColumnError(mapping, header?.cells.length ?? 0)
      if (columnError !== undefined) {
        return c.json({ error: columnError }, 400)
      }
      const stored = JSON.stringify(mapping)
      await db.update(csvImport).set({ mapping: stored }).where(eq(csvImport.id, found.id))
      return c.json({
        import: importView({ ...found, mapping: stored }),
        columns: header?.cells ?? [],
        rows: await flaggedPreviewRows(
          db,
          found.accountId,
          data,
          mapping,
          await householdCurrency(db, householdId),
        ),
      })
    },
  )
  .post(
    '/api/imports/:id/confirm',
    // The body is optional: absent means "skip every flagged duplicate";
    // { overrides: [line, …] } imports those flagged rows anyway. A bodyless
    // POST carries no JSON content-type, so the validator passes undefined
    // through and parseImportConfirm defaults it.
    validator('json', (value, c) => {
      const parsed = parseImportConfirm(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const { householdId } = c.var.membership
      const found = await findImport(db, householdId, c.req.param('id'))
      if (found === undefined) {
        return c.json({ error: 'Import not found.' }, 404)
      }
      if (found.confirmedAt !== null) {
        return c.json({ error: 'This import is already confirmed.' }, 400)
      }
      if (found.mapping === null) {
        return c.json({ error: 'Map the columns and preview before confirming.' }, 400)
      }
      const mapping = JSON.parse(found.mapping) as ImportMapping
      const [, ...data] = parseCsv(found.csv)
      // Duplicates are re-checked against the ledger now, not trusted from the
      // preview: whatever landed since can never be double-counted.
      const rows = await flaggedPreviewRows(
        db,
        found.accountId,
        data,
        mapping,
        await householdCurrency(db, householdId),
      )
      const valid = rows.flatMap((row) =>
        row.parsed === null
          ? []
          : [{ line: row.line, duplicate: row.duplicate, fields: row.parsed }],
      )
      if (valid.length === 0) {
        return c.json({ error: 'No row parses with this mapping; nothing to import.' }, 400)
      }
      const overridden = new Set(c.req.valid('json').overrides)
      // The Member's choices: flagged rows are skipped unless overridden by
      // line. Admitting zero rows is a fine outcome — re-uploading an
      // already-imported file confirms cleanly and creates nothing.
      const admitted = valid.filter((row) => !row.duplicate || overridden.has(row.line))
      const confirmedAt = new Date()
      const transactionRows = admitted.map(({ line, fields }) => ({
        // Deterministic per (Import, line) — the categories-seeding trick: two
        // racing confirms build the same ids, so the loser's batch collides on
        // the primary key and rolls back whole. The ledger can never receive
        // the same batch twice.
        id: `${found.id}:${line}`,
        accountId: found.accountId,
        ...fields,
        // All Uncategorized — the honest default for fresh imports
        // (CONTEXT.md) — and each row remembers its Import.
        kind: 'standard' as const,
        categoryId: null,
        transferId: null,
        importId: found.id,
        createdBy: c.var.user.id,
        createdAt: confirmedAt,
      }))
      const counts = {
        createdCount: admitted.length,
        malformedCount: rows.length - valid.length,
        duplicateCount: valid.length - admitted.length,
      }
      const inserts = []
      for (let at = 0; at < transactionRows.length; at += IMPORT_INSERT_CHUNK) {
        inserts.push(
          db.insert(transaction).values(transactionRows.slice(at, at + IMPORT_INSERT_CHUNK)),
        )
      }
      // One atomic D1 batch: the Transactions and the confirmation land
      // together or not at all.
      try {
        await db.batch([
          db
            .update(csvImport)
            .set({ ...counts, confirmedAt })
            .where(and(eq(csvImport.id, found.id), isNull(csvImport.confirmedAt))),
          ...inserts,
        ])
      } catch (error) {
        // The expected failure is the deterministic-id collision above: a
        // concurrent confirm won the race. Re-check rather than guess.
        const now = await findImport(db, householdId, found.id)
        if (now?.confirmedAt != null) {
          return c.json({ error: 'This import is already confirmed.' }, 400)
        }
        throw error
      }
      return c.json({ import: importView({ ...found, ...counts, confirmedAt }) })
    },
  )
  // The revert (CONTEXT.md): a bad column mapping is one click to undo,
  // whether pending or confirmed.
  .delete('/api/imports/:id', async (c) => {
    const db = createDb(c.env.DB)
    const found = await findImport(db, c.var.membership.householdId, c.req.param('id'))
    if (found === undefined) {
      return c.json({ error: 'Import not found.' }, 404)
    }
    // The Transactions' importId cascades: one DELETE removes the Import and
    // every Transaction it created atomically. Balances are derived (ADR
    // 0001), so they return to their pre-Import values on the next read.
    await db.delete(csvImport).where(eq(csvImport.id, found.id))
    return c.json({ ok: true })
  })
  // --- Categories (issue #10, ADR 0003) — member-level like the rest of the
  // ledger: the vocabulary is every Member's to shape (CONTEXT.md). A flat
  // list; archiving retires a label from assignment (enforced when
  // Transactions grow a category, issue #11) while history keeps it.
  .get(
    '/api/categories',
    // Archived Categories are hidden by default; ?includeArchived=true shows
    // the retired vocabulary so it can be renamed or brought back.
    validator('query', (value) => ({ includeArchived: value.includeArchived === 'true' })),
    async (c) => {
      const db = createDb(c.env.DB)
      const { householdId } = c.var.membership
      // Households created before seeding existed get the default set on
      // first read — idempotent, so it happens exactly once (categories.ts).
      await ensureSeededCategories(db, householdId)
      const { includeArchived } = c.req.valid('query')
      const rows = await db
        .select()
        .from(category)
        .where(
          and(
            eq(category.householdId, householdId),
            ...(includeArchived ? [] : [isNull(category.archivedAt)]),
          ),
        )
        .orderBy(...categoryOrder)
      return c.json({ categories: rows.map(categoryView) })
    },
  )
  .post(
    '/api/categories',
    validator('json', (value, c) => {
      const parsed = parseCategoryFields(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const { householdId } = c.var.membership
      // Backfill before the insert lands: otherwise a pre-seed Household
      // whose first categories call is a create would gain a row and pass
      // the zero-rows check forever, never receiving the defaults.
      await ensureSeededCategories(db, householdId)
      const row = {
        id: crypto.randomUUID(),
        householdId,
        ...c.req.valid('json'),
        archivedAt: null,
        createdAt: new Date(),
      }
      await db.insert(category).values(row)
      return c.json({ category: categoryView(row) })
    },
  )
  // Rename — name is a Category's entire editable state.
  .patch(
    '/api/categories/:id',
    validator('json', (value, c) => {
      const parsed = parseCategoryFields(value)
      return parsed.ok ? parsed.value : c.json({ error: parsed.error }, 400)
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const [updated] = await db
        .update(category)
        .set(c.req.valid('json'))
        .where(
          and(
            eq(category.id, c.req.param('id')),
            eq(category.householdId, c.var.membership.householdId),
          ),
        )
        .returning()
      if (updated === undefined) {
        return c.json({ error: 'Category not found.' }, 404)
      }
      return c.json({ category: categoryView(updated) })
    },
  )
  // Archive / unarchive mirror Accounts: rows are never deleted, and a
  // repeat archive keeps the original archivedAt (setCategoryArchived).
  .post('/api/categories/:id/archive', async (c) => {
    const db = createDb(c.env.DB)
    const row = await setCategoryArchived(db, c.var.membership.householdId, c.req.param('id'), true)
    if (row === undefined) {
      return c.json({ error: 'Category not found.' }, 404)
    }
    return c.json({ category: categoryView(row) })
  })
  .post('/api/categories/:id/unarchive', async (c) => {
    const db = createDb(c.env.DB)
    const row = await setCategoryArchived(
      db,
      c.var.membership.householdId,
      c.req.param('id'),
      false,
    )
    if (row === undefined) {
      return c.json({ error: 'Category not found.' }, 404)
    }
    return c.json({ category: categoryView(row) })
  })
  // --- Charts (issue #17) — member-level like the rest of the ledger. Every
  // aggregate a chart displays is computed server-side from the ledger and
  // served as a dedicated endpoint (issue #1): the web app renders, it never
  // sums. The monthly Net Worth series is the first; spending by Category
  // (issue #18) and Income vs Expense (issue #19) are its siblings.
  .get(
    '/api/net-worth',
    // ?through=YYYY-MM sets the series' right edge — the tests use it to pin
    // the series without depending on today's date; the web app omits it and
    // gets the current month. Malformed values are rejected, never silently
    // defaulted (the transactions filter-parsing stance).
    validator('query', (value, c) => {
      if (value.through === undefined || value.through === '') return { through: undefined }
      if (!isCalendarMonth(value.through)) {
        return c.json({ error: 'The through filter must be a calendar month like 2026-01.' }, 400)
      }
      return { through: value.through }
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      const through = c.req.valid('query').through ?? currentUtcMonth()
      const series = await monthlyNetWorthSeries(db, c.var.membership.householdId, through)
      return c.json({ series })
    },
  )
  .get(
    '/api/spending-by-category',
    // ?month=YYYY-MM picks the slice of the ledger; the web app's month
    // selector always sends it, and omitting it reads the current month.
    // Malformed values are rejected, never silently defaulted.
    validator('query', (value, c) => {
      if (value.month === undefined || value.month === '') return { month: undefined }
      if (!isCalendarMonth(value.month)) {
        return c.json({ error: 'The month filter must be a calendar month like 2026-01.' }, 400)
      }
      return { month: value.month }
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      // The resolved month echoes back so the client can label the default
      // view without re-deriving "the current month" and risking a skew.
      const month = c.req.valid('query').month ?? currentUtcMonth()
      const slices = await spendingByCategory(db, c.var.membership.householdId, month)
      return c.json({ month, slices })
    },
  )
  .get(
    '/api/income-vs-expense',
    // ?through=YYYY-MM sets the window's right edge — the tests use it to pin
    // the totals without depending on today's date; the web app omits it and
    // gets the current month. Malformed values are rejected, never silently
    // defaulted.
    validator('query', (value, c) => {
      if (value.through === undefined || value.through === '') return { through: undefined }
      if (!isCalendarMonth(value.through)) {
        return c.json({ error: 'The through filter must be a calendar month like 2026-01.' }, 400)
      }
      return { through: value.through }
    }),
    async (c) => {
      const db = createDb(c.env.DB)
      // The resolved edge echoes back so the client can label the default
      // view without re-deriving "the current month" and risking a skew.
      const through = c.req.valid('query').through ?? currentUtcMonth()
      const months = await monthlyIncomeExpense(db, c.var.membership.householdId, through)
      return c.json({ through, months })
    },
  )
  // --- Member & Invite management (issue #6) — owner-only, so the guard
  // middleware covers both resources. Non-owner Members get a 403.
  .use('/api/members/*', ownerGuard)
  .use('/api/members', ownerGuard)
  .use('/api/invites/*', ownerGuard)
  .use('/api/invites', ownerGuard)
  .get('/api/members', async (c) => {
    const db = createDb(c.env.DB)
    const members = await db
      .select({
        id: member.id,
        userId: member.userId,
        name: user.name,
        email: user.email,
        role: member.role,
        createdAt: member.createdAt,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.householdId, c.var.membership.householdId))
      // Timestamps have second precision, so role breaks the tie and keeps
      // the owner first when rows land in the same second.
      .orderBy(asc(member.createdAt), desc(member.role), asc(member.id))
    return c.json({ members })
  })
  // Removing a Member deletes their User (cascades to session, credentials
  // and the member row): a User holds no data of their own (CONTEXT.md), an
  // orphaned one could never join another Household (unique membership), and
  // a lingering row would squat the unique email and block re-inviting them.
  .delete('/api/members/:id', async (c) => {
    const db = createDb(c.env.DB)
    const [target] = await db
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(
        and(eq(member.id, c.req.param('id')), eq(member.householdId, c.var.membership.householdId)),
      )
      .limit(1)
    if (!target) {
      return c.json({ error: 'Member not found.' }, 404)
    }
    if (target.role === 'owner') {
      return c.json({ error: "The household owner can't be removed." }, 400)
    }
    await db.delete(user).where(eq(user.id, target.userId))
    return c.json({ ok: true })
  })
  .get('/api/invites', async (c) => {
    const db = createDb(c.env.DB)
    const now = new Date()
    const invites = await db
      .select({
        id: invite.id,
        token: invite.token,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      })
      .from(invite)
      // Pending only: consumed, expired and revoked Invites are history, not
      // actionable, so the management screen never shows them.
      .where(and(eq(invite.householdId, c.var.membership.householdId), pendingInviteFilter(now)))
      .orderBy(asc(invite.createdAt), asc(invite.id))
    return c.json({ invites })
  })
  .post('/api/invites', async (c) => {
    const db = createDb(c.env.DB)
    const body: unknown = await c.req.json().catch(() => ({}))
    const requested = (body as { expiresInSeconds?: unknown }).expiresInSeconds
    const ttlSeconds =
      typeof requested === 'number' && Number.isFinite(requested) && requested >= 1
        ? Math.min(Math.floor(requested), INVITE_MAX_TTL_SECONDS)
        : INVITE_DEFAULT_TTL_SECONDS
    const now = new Date()
    const created = {
      id: crypto.randomUUID(),
      token: generateInviteToken(),
      householdId: c.var.membership.householdId,
      createdBy: c.var.user.id,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      createdAt: now,
    }
    await db.insert(invite).values(created)
    const { id, token, expiresAt, createdAt } = created
    return c.json({ invite: { id, token, expiresAt, createdAt } })
  })
  // Revoke: only a pending Invite can be withdrawn — the conditional UPDATE
  // makes revoking a just-consumed Invite report 404 instead of silently
  // rewriting history.
  .delete('/api/invites/:id', async (c) => {
    const db = createDb(c.env.DB)
    const [revoked] = await db
      .update(invite)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invite.id, c.req.param('id')),
          eq(invite.householdId, c.var.membership.householdId),
          isNull(invite.usedAt),
          isNull(invite.revokedAt),
        ),
      )
      .returning({ id: invite.id })
    if (revoked === undefined) {
      return c.json({ error: 'Invite not found.' }, 404)
    }
    return c.json({ ok: true })
  })

// The RPC surface consumed by hc<AppType>() in apps/web.
export type AppType = typeof app

export default app
