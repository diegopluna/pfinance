import { createDb, household, member, meta } from '@pfinance/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ServerEnv } from './env.ts'
import { createAuth } from './auth.ts'
import { matchesTrustedOrigin, trustedOrigins } from './origins.ts'
import { selfServeSignUpAllowed } from './signup-gate.ts'

type SessionUser = { id: string; email: string; name: string }

type Variables = {
  user: SessionUser
  membership: { householdId: string; role: 'owner' | 'member' }
}

const authFor = (c: { env: ServerEnv; req: { url: string } }) =>
  createAuth(c.env, new URL(c.req.url).origin)

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
    return c.json({ allowed: await selfServeSignUpAllowed(db, c.env) })
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
      .select({ id: household.id, name: household.name })
      .from(household)
      .where(eq(household.id, householdId))
      .limit(1)
    if (!householdRow) {
      return c.json({ error: 'Household not found' }, 500)
    }
    const { id, email, name } = c.var.user
    return c.json({ user: { id, email, name }, household: householdRow, role })
  })

// The RPC surface consumed by hc<AppType>() in apps/web.
export type AppType = typeof app

export default app
