import { isSupportedCurrency, type CurrencyCode } from '@pfinance/currency'
import { category, household, invite, member, user, type Db } from '@pfinance/db'
import { APIError } from 'better-auth/api'
import { and, eq, sql } from 'drizzle-orm'
import { seedCategoryRows } from './categories.ts'
import { pendingInviteFilter } from './invites.ts'

// The sign-up flow's second half: after Better Auth inserts the User row,
// attach their Membership — by Invite redemption or by the bootstrap claim
// (ADR 0004). Extracted from the user.create.after hook in auth.ts so the
// concurrency edges are testable at the db-harness seam (issue #52).

// The Household's Currency is chosen at sign-up and immutable afterwards
// (ADR 0002), so a missing or unsupported code fails the sign-up rather than
// defaulting to one the user never picked. Shared by both user-create hooks:
// the before hook rejects while no User exists yet, attachMember re-checks
// to narrow the untyped body.
export const requireSupportedCurrency = (requested: unknown): CurrencyCode => {
  if (!isSupportedCurrency(requested)) {
    throw new APIError('BAD_REQUEST', {
      message: 'Choose a supported currency for your household.',
    })
  }
  return requested
}

// The sign-up body's inviteToken rides through Better Auth untyped, like
// householdName below — hence the runtime narrowing.
export const inviteTokenFrom = (body: unknown): string | undefined => {
  const requested = (body as { inviteToken?: unknown } | undefined)?.inviteToken
  return typeof requested === 'string' && requested !== '' ? requested : undefined
}

// Sign-up gives the new User their Membership in one flow: redeeming an
// Invite joins its Household, otherwise the bootstrap claim creates one with
// them as owner. db.batch is a single atomic D1 transaction. The User insert
// itself already happened (Better Auth's own statement), so any failure here
// compensates by deleting that row (issue #52): a Member-less User would be
// 401'd forever, and worse, would hold the zero-Users bootstrap gate closed
// on a never-claimed instance. The delete reopens the slot — an invite-race
// loser or a rejected bootstrap can simply sign up again.
export const attachMember = async (
  db: Db,
  newUser: { id: string; name: string },
  body: unknown,
): Promise<void> => {
  try {
    await attach(db, newUser, body)
  } catch (error) {
    // Sessions and auth_account rows cascade; neither exists yet anyway —
    // Better Auth creates them after this hook.
    await db.delete(user).where(eq(user.id, newUser.id))
    throw error
  }
}

const attach = async (
  db: Db,
  newUser: { id: string; name: string },
  body: unknown,
): Promise<void> => {
  const inviteToken = inviteTokenFrom(body)
  if (inviteToken !== undefined) {
    const now = new Date()
    // Consume atomically: the conditional UPDATE only lands on a
    // still-pending Invite, so two racing redemptions can't both claim it
    // (single-use).
    const [claimed] = await db
      .update(invite)
      .set({ usedAt: now, usedBy: newUser.id })
      .where(and(eq(invite.token, inviteToken), pendingInviteFilter(now)))
      .returning({ householdId: invite.householdId })
    if (claimed === undefined) {
      // Lost the race since the before hook's check.
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
  // The user names their Household at sign-up (an extra field on the
  // sign-up body, which Better Auth passes through untyped — hence the
  // runtime guard); default keeps sign-up resilient.
  const requested = (body as { householdName?: unknown } | undefined)?.householdName
  const householdName =
    typeof requested === 'string' && requested.trim() !== ''
      ? requested.trim().slice(0, 120)
      : `${newUser.name}'s Household`
  const currency = requireSupportedCurrency((body as { currency?: unknown } | undefined)?.currency)
  const now = new Date()
  const householdId = crypto.randomUUID()
  try {
    await db.batch([
      db.insert(household).values({
        id: householdId,
        // The atomic bootstrap claim (issue #52): the CASE collapses the
        // NOT NULL name to NULL when any Household already exists, failing
        // this statement — and with it the whole batch — so two sign-ups
        // racing through the zero-Users gate can never both claim the
        // instance. Same-batch evaluation order makes it safe: this is the
        // batch's first statement, so the subquery only ever sees rows a
        // competing (committed) claim wrote.
        name: sql`case when exists (select 1 from ${household}) then null else ${householdName} end`,
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
      // The Household starts with the default Category vocabulary (ADR 0003,
      // issue #10) in the same atomic batch.
      db.insert(category).values(seedCategoryRows(householdId, now)),
    ])
  } catch (error) {
    // A Household existing after our batch rolled back means a competing
    // claim won — that sign-up race is the only way this batch can lose to
    // one. The loser gets the same 403 the gate gives once claimed.
    const [winner] = await db.select({ id: household.id }).from(household).limit(1)
    if (winner !== undefined) {
      throw new APIError('FORBIDDEN', {
        message: 'Sign-ups are disabled on this instance.',
      })
    }
    throw error
  }
}
