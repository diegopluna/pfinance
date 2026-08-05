import { authAccount, createDb, household, member, session, user, verification } from '@pfinance/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import type { ServerEnv } from './env.ts'
import { trustedOrigins } from './origins.ts'
import { selfServeSignUpAllowed } from './signup-gate.ts'

// Email+password only, no verification, no reset (docs/adr/0005).
// baseURL comes from the incoming request: the worker doesn't know its own
// URL at deploy time (workers.dev subdomain vs custom domain).
export const createAuth = (env: ServerEnv, baseURL: string) => {
  const db = createDb(env.DB)
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    basePath: '/api/auth',
    emailAndPassword: { enabled: true },
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      // The auth credentials table is named auth_account — "account" is
      // reserved for the financial Account concept.
      schema: { user, session, account: authAccount, verification },
    }),
    // The web app runs on its own origin (localhost:3000 in dev, its own
    // workers.dev domain deployed), so its origin must be trusted and the
    // session cookie must survive cross-site requests.
    trustedOrigins: trustedOrigins(env),
    advanced: {
      defaultCookieAttributes: { sameSite: 'none', secure: true },
    },
    databaseHooks: {
      user: {
        create: {
          // Self-serve sign-up gating (SIGNUPS_ENABLED + bootstrap exception,
          // ADR 0004). Guarding user creation rather than the sign-up route
          // keeps every path that would mint a User behind the gate; the
          // invites exception (ADR 0004 §2) will need an explicit bypass here
          // when it lands. A thrown APIError aborts the creation and becomes
          // the endpoint's error response.
          before: async () => {
            if (!(await selfServeSignUpAllowed(db, env))) {
              throw new APIError('FORBIDDEN', {
                message: 'Sign-ups are disabled on this instance.',
              })
            }
          },
          // Sign-up creates the User's Household with them as owner, in one
          // flow. db.batch is a single atomic D1 transaction. Known limit:
          // the User insert itself is a separate operation, so if this hook
          // fails a User exists without a Membership and the session
          // middleware rejects them (401) — recovery is deployer-side today.
          after: async (newUser, ctx) => {
            // The user names their Household at sign-up (an extra field on
            // the sign-up body, which Better Auth passes through untyped —
            // hence the runtime guard); default keeps sign-up resilient.
            const requested = ctx?.body?.householdName
            const householdName =
              typeof requested === 'string' && requested.trim() !== ''
                ? requested.trim().slice(0, 120)
                : `${newUser.name}'s Household`
            const now = new Date()
            const householdId = crypto.randomUUID()
            await db.batch([
              db.insert(household).values({
                id: householdId,
                name: householdName,
                createdAt: now,
              }),
              db.insert(member).values({
                id: crypto.randomUUID(),
                userId: newUser.id,
                householdId,
                role: 'owner',
                createdAt: now,
              }),
            ])
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
