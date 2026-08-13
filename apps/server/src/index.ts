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
  user,
  type Db,
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
  confirmImport,
  findImport,
  flaggedPreviewRows,
  householdCurrency,
  IMPORT_MAX_ROWS,
  importView,
  listImports,
  loadImport,
  mappingColumnError,
  parseCsv,
  parseImportConfirm,
  parseImportMapping,
  parseNewImport,
} from './imports.ts'
import { apiMeta } from './compat.ts'
import { monthlyIncomeExpense } from './income-expense.ts'
import { currentUtcMonth, monthlyNetWorthSeries } from './net-worth.ts'
import { matchesTrustedOrigin, trustedOrigins } from './origins.ts'
import { owned, requireAccount, type Scope } from './scope.ts'
import { selfServeSignUpAllowed } from './signup-gate.ts'
import { spendingByCategory } from './spending.ts'
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  parseNewTransaction,
  parseTransactionFilters,
  parseTransactionPatch,
  updateTransaction,
} from './transactions.ts'
import {
  createTransfer,
  deleteTransfer,
  parseNewTransfer,
  parseTransferPatch,
  updateTransfer,
} from './transfers.ts'
import { calendarMonthValidator, parsedValidator } from './validators.ts'

type SessionUser = { id: string; email: string; name: string }

type Variables = {
  user: SessionUser
  membership: { householdId: string; role: 'owner' | 'member' }
  // Resolved once per request by the session middleware: the DB handle and
  // the Scope every data access takes (scope.ts). Handlers under /api/*
  // never build their own.
  db: Db
  scope: Scope
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
  // Public: the compatibility probe (ADR 0007). A store-distributed client
  // hits this before any session exists to classify the Server — its absence
  // on old deployments is itself the "Server too old" signal, so the route
  // must stay public, sessionless, and registered before the /api/* session
  // middleware below.
  .get('/api/meta', (c) => c.json(apiMeta))
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
    c.set('db', db)
    c.set('scope', { householdId: membership.householdId, userId: sessionData.user.id })
    await next()
  })
  .get('/api/me', async (c) => {
    const { db, scope } = c.var
    const { role } = c.var.membership
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
      .where(owned.household(scope))
      .limit(1)
    if (!householdRow) {
      return c.json({ error: 'Household not found' }, 500)
    }
    // The shell's identity line ("BRL · 2 members") wants the count, and
    // every Member may see it — unlike the owner-only /api/members list.
    const [memberCountRow] = await db
      .select({ memberCount: count() })
      .from(member)
      .where(owned.member(scope))
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
  .patch('/api/household', parsedValidator('json', parseHouseholdPatch), async (c) => {
    const { db, scope } = c.var
    const [updated] = await db
      .update(household)
      .set(c.req.valid('json'))
      .where(owned.household(scope))
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
  })
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
      const { db, scope } = c.var
      const { includeArchived } = c.req.valid('query')
      const rows = await db
        // One grouped query derives every Balance: the ledger sum joins in
        // (ADR 0001), zero for Accounts with no Transactions yet.
        .select({ row: account, ledgerTotal: ledgerSumExpr })
        .from(account)
        .leftJoin(transaction, eq(transaction.accountId, account.id))
        .where(and(owned.account(scope), ...(includeArchived ? [] : [isNull(account.archivedAt)])))
        .groupBy(account.id)
        // Name breaks the tie within a second so the order is stable.
        .orderBy(asc(account.createdAt), asc(account.name), asc(account.id))
      return c.json({ accounts: rows.map(({ row, ledgerTotal }) => accountView(row, ledgerTotal)) })
    },
  )
  .post('/api/accounts', parsedValidator('json', parseNewAccount), async (c) => {
    const { db, scope } = c.var
    const row = {
      id: crypto.randomUUID(),
      householdId: scope.householdId,
      ...c.req.valid('json'),
      archivedAt: null,
      createdAt: new Date(),
    }
    await db.insert(account).values(row)
    // A brand-new Account has no Transactions: the ledger sum is zero.
    return c.json({ account: accountView(row, 0) })
  })
  .patch('/api/accounts/:id', parsedValidator('json', parseAccountPatch), async (c) => {
    const { db, scope } = c.var
    const [updated] = await db
      .update(account)
      .set(c.req.valid('json'))
      .where(and(eq(account.id, c.req.param('id')), owned.account(scope)))
      .returning()
    if (updated === undefined) {
      return c.json({ error: 'Account not found.' }, 404)
    }
    return c.json({ account: accountView(updated, await ledgerSum(db, updated.id)) })
  })
  // Archiving hides an Account that closed in real life; unarchiving is the
  // undo. Both keep every row — history is never deleted — and both are
  // idempotent via setAccountArchived (a repeat archive keeps the original
  // archivedAt).
  .post('/api/accounts/:id/archive', async (c) => {
    const { db, scope } = c.var
    const row = await setAccountArchived(db, scope, c.req.param('id'), true)
    if (row === undefined) {
      return c.json({ error: 'Account not found.' }, 404)
    }
    return c.json({ account: accountView(row, await ledgerSum(db, row.id)) })
  })
  .post('/api/accounts/:id/unarchive', async (c) => {
    const { db, scope } = c.var
    const row = await setAccountArchived(db, scope, c.req.param('id'), false)
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
    parsedValidator('query', (value) =>
      parseTransactionFilters(value as Record<string, string | undefined>),
    ),
    async (c) => {
      const { db, scope } = c.var
      const transactions = await listTransactions(db, scope, c.req.valid('query'))
      return c.json({ transactions })
    },
  )
  .post('/api/transactions', parsedValidator('json', parseNewTransaction), async (c) => {
    const { db, scope } = c.var
    const result = await createTransaction(db, scope, c.req.valid('json'))
    return result.ok
      ? c.json({ transaction: result.value })
      : c.json({ error: result.error }, result.status)
  })
  .patch('/api/transactions/:id', parsedValidator('json', parseTransactionPatch), async (c) => {
    const { db, scope } = c.var
    const result = await updateTransaction(db, scope, c.req.param('id'), c.req.valid('json'))
    return result.ok
      ? c.json({ transaction: result.value })
      : c.json({ error: result.error }, result.status)
  })
  .delete('/api/transactions/:id', async (c) => {
    const { db, scope } = c.var
    const result = await deleteTransaction(db, scope, c.req.param('id'))
    return result.ok ? c.json({ ok: true }) : c.json({ error: result.error }, result.status)
  })
  // --- Transfers (issue #12) — member-level like the rest of the ledger. A
  // Transfer is one entity whose two legs can never drift: every write lands
  // on both legs in one atomic D1 batch (the auth.ts pattern), and delete
  // cascades from the transfer row itself. Legs are read through
  // /api/transactions like any Transaction and excluded from the
  // Expense/Income views by kind (transactions.ts).
  .post('/api/transfers', parsedValidator('json', parseNewTransfer), async (c) => {
    const { db, scope } = c.var
    const result = await createTransfer(db, scope, c.req.valid('json'))
    return result.ok
      ? c.json({ transfer: result.value })
      : c.json({ error: result.error }, result.status)
  })
  .patch('/api/transfers/:id', parsedValidator('json', parseTransferPatch), async (c) => {
    const { db, scope } = c.var
    const result = await updateTransfer(db, scope, c.req.param('id'), c.req.valid('json'))
    return result.ok
      ? c.json({ transfer: result.value })
      : c.json({ error: result.error }, result.status)
  })
  .delete('/api/transfers/:id', async (c) => {
    const { db, scope } = c.var
    const result = await deleteTransfer(db, scope, c.req.param('id'))
    return result.ok ? c.json({ ok: true }) : c.json({ error: result.error }, result.status)
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
    const { db, scope } = c.var
    return c.json({ imports: await listImports(db, scope) })
  })
  .post('/api/imports', parsedValidator('json', parseNewImport), async (c) => {
    const { db, scope } = c.var
    const fields = c.req.valid('json')
    if (!(await requireAccount(db, scope, fields.accountId))) {
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
  })
  .get('/api/imports/:id', async (c) => {
    const { db, scope } = c.var
    const loaded = await loadImport(db, scope, c.req.param('id'))
    if (loaded === undefined) {
      return c.json({ error: 'Import not found.' }, 404)
    }
    return c.json({ import: importView(loaded.row), columns: loaded.header?.cells ?? [] })
  })
  // The map step: persists the mapping on the pending Import — confirm
  // re-parses the same bytes with the same mapping, so what was last
  // previewed is exactly what confirm creates — and returns every data
  // row's fate, duplicate flags included.
  .post('/api/imports/:id/preview', parsedValidator('json', parseImportMapping), async (c) => {
    const { db, scope } = c.var
    const loaded = await loadImport(db, scope, c.req.param('id'))
    if (loaded === undefined) {
      return c.json({ error: 'Import not found.' }, 404)
    }
    const { row: found, header, records } = loaded
    if (found.confirmedAt !== null) {
      return c.json({ error: 'This import is confirmed; its mapping is frozen.' }, 400)
    }
    const mapping = c.req.valid('json')
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
        records,
        mapping,
        await householdCurrency(db, scope),
      ),
    })
  })
  .post(
    '/api/imports/:id/confirm',
    // The body is optional: absent means "skip every flagged duplicate";
    // { overrides: [line, …] } imports those flagged rows anyway. A bodyless
    // POST carries no JSON content-type, so the validator passes undefined
    // through and parseImportConfirm defaults it.
    parsedValidator('json', parseImportConfirm),
    async (c) => {
      const { db, scope } = c.var
      const result = await confirmImport(db, scope, c.req.param('id'), c.req.valid('json'))
      return result.ok
        ? c.json({ import: result.value })
        : c.json({ error: result.error }, result.status)
    },
  )
  // The revert (CONTEXT.md): a bad column mapping is one click to undo,
  // whether pending or confirmed.
  .delete('/api/imports/:id', async (c) => {
    const { db, scope } = c.var
    const found = await findImport(db, scope, c.req.param('id'))
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
      const { db, scope } = c.var
      // Households created before seeding existed get the default set on
      // first read — idempotent, so it happens exactly once (categories.ts).
      await ensureSeededCategories(db, scope)
      const { includeArchived } = c.req.valid('query')
      const rows = await db
        .select()
        .from(category)
        .where(
          and(owned.category(scope), ...(includeArchived ? [] : [isNull(category.archivedAt)])),
        )
        .orderBy(...categoryOrder)
      return c.json({ categories: rows.map(categoryView) })
    },
  )
  .post('/api/categories', parsedValidator('json', parseCategoryFields), async (c) => {
    const { db, scope } = c.var
    // Backfill before the insert lands: otherwise a pre-seed Household
    // whose first categories call is a create would gain a row and pass
    // the zero-rows check forever, never receiving the defaults.
    await ensureSeededCategories(db, scope)
    const row = {
      id: crypto.randomUUID(),
      householdId: scope.householdId,
      ...c.req.valid('json'),
      archivedAt: null,
      createdAt: new Date(),
    }
    await db.insert(category).values(row)
    return c.json({ category: categoryView(row) })
  })
  // Rename — name is a Category's entire editable state.
  .patch('/api/categories/:id', parsedValidator('json', parseCategoryFields), async (c) => {
    const { db, scope } = c.var
    const [updated] = await db
      .update(category)
      .set(c.req.valid('json'))
      .where(and(eq(category.id, c.req.param('id')), owned.category(scope)))
      .returning()
    if (updated === undefined) {
      return c.json({ error: 'Category not found.' }, 404)
    }
    return c.json({ category: categoryView(updated) })
  })
  // Archive / unarchive mirror Accounts: rows are never deleted, and a
  // repeat archive keeps the original archivedAt (setCategoryArchived).
  .post('/api/categories/:id/archive', async (c) => {
    const { db, scope } = c.var
    const row = await setCategoryArchived(db, scope, c.req.param('id'), true)
    if (row === undefined) {
      return c.json({ error: 'Category not found.' }, 404)
    }
    return c.json({ category: categoryView(row) })
  })
  .post('/api/categories/:id/unarchive', async (c) => {
    const { db, scope } = c.var
    const row = await setCategoryArchived(db, scope, c.req.param('id'), false)
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
    calendarMonthValidator('through'),
    async (c) => {
      const { db, scope } = c.var
      const through = c.req.valid('query').through ?? currentUtcMonth()
      const series = await monthlyNetWorthSeries(db, scope, through)
      return c.json({ series })
    },
  )
  .get(
    '/api/spending-by-category',
    // ?month=YYYY-MM picks the slice of the ledger; the web app's month
    // selector always sends it, and omitting it reads the current month.
    // Malformed values are rejected, never silently defaulted.
    calendarMonthValidator('month'),
    async (c) => {
      const { db, scope } = c.var
      // The resolved month echoes back so the client can label the default
      // view without re-deriving "the current month" and risking a skew.
      const month = c.req.valid('query').month ?? currentUtcMonth()
      const slices = await spendingByCategory(db, scope, month)
      return c.json({ month, slices })
    },
  )
  .get(
    '/api/income-vs-expense',
    // ?through=YYYY-MM sets the window's right edge — the tests use it to pin
    // the totals without depending on today's date; the web app omits it and
    // gets the current month. Malformed values are rejected, never silently
    // defaulted.
    calendarMonthValidator('through'),
    async (c) => {
      const { db, scope } = c.var
      // The resolved edge echoes back so the client can label the default
      // view without re-deriving "the current month" and risking a skew.
      const through = c.req.valid('query').through ?? currentUtcMonth()
      const months = await monthlyIncomeExpense(db, scope, through)
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
    const { db, scope } = c.var
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
      .where(owned.member(scope))
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
    const { db, scope } = c.var
    const [target] = await db
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(and(eq(member.id, c.req.param('id')), owned.member(scope)))
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
    const { db, scope } = c.var
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
      .where(and(owned.invite(scope), pendingInviteFilter(now)))
      .orderBy(asc(invite.createdAt), asc(invite.id))
    return c.json({ invites })
  })
  .post('/api/invites', async (c) => {
    const { db, scope } = c.var
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
      householdId: scope.householdId,
      createdBy: scope.userId,
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
    const { db, scope } = c.var
    const [revoked] = await db
      .update(invite)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(invite.id, c.req.param('id')),
          owned.invite(scope),
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

// The RPC surface consumed by hc<AppType>() in @pfinance/api-client.
export type AppType = typeof app

export default app
