import { authAccount, createDb, session, user, verification } from '@pfinance/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import type { ServerEnv } from './env.ts'
import { findInvite, inviteRejectionMessage } from './invites.ts'
import { trustedOrigins } from './origins.ts'
import { selfServeSignUpAllowed } from './signup-gate.ts'
import { attachMember, requireSupportedCurrency, signupFieldsFrom } from './signup.ts'

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
    // No `session` config on purpose: the default 7-day rolling expiry is the
    // pinned interpretation of "persists until sign-out" (ADR 0005, issue #54).
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
          // Self-serve sign-up gating (locked once a User exists, bootstrap
          // exception, ADR 0004). Guarding user creation rather than the
          // sign-up route keeps every path that would mint a User behind the
          // gate. A thrown APIError aborts the creation and becomes the
          // endpoint's error response.
          before: async (_newUser, ctx) => {
            const { inviteToken, currency } = signupFieldsFrom(ctx?.body)
            if (inviteToken !== undefined) {
              // Invite redemption bypasses the gate (ADR 0004 §2) — issuing
              // the Invite was the consent. No currency either: the recipient
              // joins the inviting Household instead of creating one. This
              // check gives the clear rejection; the after hook re-checks
              // atomically on consumption.
              const found = await findInvite(db, inviteToken, new Date())
              if (found.status !== 'pending') {
                throw new APIError('FORBIDDEN', {
                  message: inviteRejectionMessage[found.status],
                })
              }
              return
            }
            if (!(await selfServeSignUpAllowed(db))) {
              throw new APIError('FORBIDDEN', {
                message: 'Sign-ups are disabled on this instance.',
              })
            }
            requireSupportedCurrency(currency)
          },
          // Sign-up gives the new User their Membership in the same flow —
          // Invite redemption or the bootstrap claim. The body lives in
          // signup.ts (attachMember) so its concurrency edges are testable
          // at the db-harness seam (issue #52).
          after: async (newUser, ctx) => {
            await attachMember(db, newUser, ctx?.body)
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
