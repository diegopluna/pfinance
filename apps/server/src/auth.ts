import { authAccount, createDb, household, member, session, user, verification } from '@pfinance/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { ServerEnv } from '../../../alchemy.run.ts'

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
    trustedOrigins: ['http://localhost:3000', 'https://*.workers.dev'],
    advanced: {
      defaultCookieAttributes: { sameSite: 'none', secure: true },
    },
    databaseHooks: {
      user: {
        create: {
          // Sign-up creates the User's Household with them as owner, in one
          // flow. db.batch is a single atomic D1 transaction.
          after: async (newUser) => {
            const now = new Date()
            const householdId = crypto.randomUUID()
            await db.batch([
              db.insert(household).values({
                id: householdId,
                name: `${newUser.name}'s Household`,
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
