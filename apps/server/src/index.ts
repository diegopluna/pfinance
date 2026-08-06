import {
  account,
  category,
  createDb,
  household,
  invite,
  member,
  meta,
  transaction,
  user,
} from '@pfinance/db'
import { and, asc, desc, eq, isNull } from 'drizzle-orm'
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
import {
  findInvite,
  generateInviteToken,
  INVITE_DEFAULT_TTL_SECONDS,
  INVITE_MAX_TTL_SECONDS,
  pendingInviteFilter,
} from './invites.ts'
import { matchesTrustedOrigin, trustedOrigins } from './origins.ts'
import { selfServeSignUpAllowed } from './signup-gate.ts'
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
      // currency rides along so clients can format every amount (ADR 0002).
      .select({ id: household.id, name: household.name, currency: household.currency })
      .from(household)
      .where(eq(household.id, householdId))
      .limit(1)
    if (!householdRow) {
      return c.json({ error: 'Household not found' }, 500)
    }
    const { id, email, name } = c.var.user
    return c.json({ user: { id, email, name }, household: householdRow, role })
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
      const patch = c.req.valid('json')
      if (
        patch.accountId !== undefined &&
        !(await accountInHousehold(db, c.var.membership.householdId, patch.accountId))
      ) {
        return c.json({ error: 'Unknown account.' }, 400)
      }
      // Guard only a newly named Category (null clears, undefined keeps): a
      // row already carrying an archived Category stays editable.
      if (patch.categoryId != null) {
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
    await db.delete(transaction).where(eq(transaction.id, existing.id))
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
