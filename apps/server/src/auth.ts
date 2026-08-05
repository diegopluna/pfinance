import { isSupportedCurrency, type CurrencyCode } from '@pfinance/currency'
import {
  authAccount,
  createDb,
  household,
  invite,
  member,
  session,
  user,
  verification,
} from '@pfinance/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { ServerEnv } from './env.ts'
import { findInvite, inviteRejectionMessage } from './invites.ts'
import { trustedOrigins } from './origins.ts'
import { selfServeSignUpAllowed } from './signup-gate.ts'

// The Household's Currency is chosen at sign-up and immutable afterwards
// (ADR 0002), so a missing or unsupported code fails the sign-up rather than
// defaulting to one the user never picked. Shared by both user-create hooks:
// the before hook rejects while no User exists yet, the after hook re-checks
// to narrow the untyped body.
const requireSupportedCurrency = (requested: unknown): CurrencyCode => {
  if (!isSupportedCurrency(requested)) {
    throw new APIError('BAD_REQUEST', {
      message: 'Choose a supported currency for your household.',
    })
  }
  return requested
}

// The sign-up body's inviteToken rides through Better Auth untyped, like
// householdName below — hence the runtime narrowing.
const inviteTokenFrom = (body: unknown): string | undefined => {
  const requested = (body as { inviteToken?: unknown } | undefined)?.inviteToken
  return typeof requested === 'string' && requested !== '' ? requested : undefined
}

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
          // Self-serve sign-up gating (locked once a User exists, bootstrap
          // exception, ADR 0004). Guarding user creation rather than the
          // sign-up route keeps every path that would mint a User behind the
          // gate. A thrown APIError aborts the creation and becomes the
          // endpoint's error response.
          before: async (_newUser, ctx) => {
            const inviteToken = inviteTokenFrom(ctx?.body)
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
            requireSupportedCurrency(ctx?.body?.currency)
          },
          // Sign-up creates the User's Household with them as owner, in one
          // flow. db.batch is a single atomic D1 transaction. Known limit:
          // the User insert itself is a separate operation, so if this hook
          // fails a User exists without a Membership and the session
          // middleware rejects them (401) — recovery is deployer-side today.
          after: async (newUser, ctx) => {
            const inviteToken = inviteTokenFrom(ctx?.body)
            if (inviteToken !== undefined) {
              const now = new Date()
              // Consume atomically: the conditional UPDATE only lands on a
              // still-pending Invite, so two racing redemptions can't both
              // claim it (single-use).
              const [claimed] = await db
                .update(invite)
                .set({ usedAt: now, usedBy: newUser.id })
                .where(
                  and(
                    eq(invite.token, inviteToken),
                    isNull(invite.usedAt),
                    isNull(invite.revokedAt),
                    gt(invite.expiresAt, now),
                  ),
                )
                .returning({ householdId: invite.householdId })
              if (claimed === undefined) {
                // Lost the race since the before hook's check. Same known
                // limit as below: the User row already exists, so until a
                // deployer cleans it up the session middleware rejects them.
                throw new APIError('FORBIDDEN', {
                  message: 'This invite is no longer valid.',
                })
              }
              await db.insert(member).values({
                id: crypto.randomUUID(),
                userId: newUser.id,
                householdId: claimed.householdId,
                role: 'member',
                createdAt: now,
              })
              return
            }
            // The user names their Household at sign-up (an extra field on
            // the sign-up body, which Better Auth passes through untyped —
            // hence the runtime guard); default keeps sign-up resilient.
            const requested = ctx?.body?.householdName
            const householdName =
              typeof requested === 'string' && requested.trim() !== ''
                ? requested.trim().slice(0, 120)
                : `${newUser.name}'s Household`
            const currency = requireSupportedCurrency(ctx?.body?.currency)
            const now = new Date()
            const householdId = crypto.randomUUID()
            await db.batch([
              db.insert(household).values({
                id: householdId,
                name: householdName,
                currency,
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
