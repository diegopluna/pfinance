import { createDb, household, member, meta } from '@pfinance/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { ServerEnv } from '../../../alchemy.run.ts'
import { createAuth } from './auth.ts'

type SessionUser = { id: string; email: string; name: string }

type Variables = {
  user: SessionUser
  membership: { householdId: string; role: 'owner' | 'member' }
}

const app = new Hono<{ Bindings: ServerEnv; Variables: Variables }>()

// The web app calls from its own origin with credentials; allow localhost
// (local dev) and workers.dev (deployed) origins only.
const allowedOrigin = (origin: string) =>
  /^http:\/\/localhost(:\d+)?$/.test(origin) ||
  /^https:\/\/[\w-]+(\.[\w-]+)*\.workers\.dev$/.test(origin)
    ? origin
    : undefined

app.use('*', cors({ origin: allowedOrigin, credentials: true }))

app.get('/health', async (c) => {
  const db = createDb(c.env.DB)
  // Querying a migrated table proves the schema was applied to the bound
  // database — the query throws (→ 500) if the migration never ran.
  await db.select({ key: meta.key }).from(meta).limit(1)
  return c.json({ ok: true })
})

// Better Auth owns everything under /api/auth/* (sign-up, sign-in, sign-out,
// get-session). Registered before the session middleware, so it stays public.
app.on(['GET', 'POST'], '/api/auth/*', (c) =>
  createAuth(c.env, new URL(c.req.url).origin).handler(c.req.raw),
)

// Every other /api route requires a session; the caller's Membership is
// resolved here so handlers scope all data access to c.var.membership.householdId.
app.use('/api/*', async (c, next) => {
  const auth = createAuth(c.env, new URL(c.req.url).origin)
  const sessionData = await auth.api.getSession({ headers: c.req.raw.headers })
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

app.get('/api/me', async (c) => {
  const db = createDb(c.env.DB)
  const { householdId, role } = c.var.membership
  const [home] = await db
    .select({ id: household.id, name: household.name })
    .from(household)
    .where(eq(household.id, householdId))
    .limit(1)
  if (!home) {
    return c.json({ error: 'Household not found' }, 500)
  }
  const { id, email, name } = c.var.user
  return c.json({ user: { id, email, name }, household: home, role })
})

export default app
