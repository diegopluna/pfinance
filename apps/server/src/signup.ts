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

// The slice of Better Auth's user model the flow reads.
type NewUser = { id: string; name: string }

// The Household's Currency is chosen at sign-up and immutable afterwards
// (ADR 0002), so a missing or unsupported code fails the sign-up rather than
// defaulting to one the user never picked. Shared by both user-create hooks:
// the before hook rejects while no User exists yet, attachMember re-checks
// to narrow the untyped currency.
export const requireSupportedCurrency = (requested: unknown): CurrencyCode => {
  if (!isSupportedCurrency(requested)) {
    throw new APIError('BAD_REQUEST', {
      message: 'Choose a supported currency for your household.',
    })
  }
  return requested
}

// The sign-up body's extra fields ride through Better Auth untyped; this one
// narrowing is shared by both user-create hooks so they can't read the body
// two different ways. currency stays unknown here — requireSupportedCurrency
// is its narrowing, at the point each hook enforces it.
export const signupFieldsFrom = (body: unknown) => {
  const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const inviteToken = fields.inviteToken
  const householdName = fields.householdName
  return {
    inviteToken: typeof inviteToken === 'string' && inviteToken !== '' ? inviteToken : undefined,
    householdName:
      typeof householdName === 'string' && householdName.trim() !== ''
        ? householdName.trim().slice(0, 120)
        : undefined,
    currency: fields.currency,
  }
}

// Sign-up gives the new User their Membership in one flow: redeeming an
// Invite joins its Household, otherwise the bootstrap claim creates one with
// them as owner. The User insert itself already happened (Better Auth's own
// statement), so any failure here compensates by deleting that row (issue
// #52): a Member-less User would be 401'd forever, and worse, would hold the
// zero-Users bootstrap gate closed on a never-claimed instance. The delete
// reopens the slot — an invite-race loser or a rejected bootstrap can simply
// sign up again.
export const attachMember = async (db: Db, newUser: NewUser, body: unknown): Promise<void> => {
  try {
    await redeemInviteOrClaimBootstrap(db, newUser, body)
  } catch (error) {
    try {
      // Sessions and auth_account rows cascade; neither exists yet anyway —
      // Better Auth creates them after this hook.
      await db.delete(user).where(eq(user.id, newUser.id))
    } catch {
      // The orphan outlives us — the old lockout, now reachable only if the
      // database fails twice in a row. Surfacing the original error matters
      // more than replacing it with the delete's.
    }
    throw error
  }
}

const redeemInviteOrClaimBootstrap = async (
  db: Db,
  newUser: NewUser,
  body: unknown,
): Promise<void> => {
  const fields = signupFieldsFrom(body)
  const { inviteToken, householdName } = fields
  if (inviteToken !== undefined) {
    const now = new Date()
    // Consume atomically: the conditional UPDATE only lands on a
    // still-pending Invite, so two racing redemptions can't both claim it
    // (single-use). Known limit: the Member insert below is a second
    // statement, so a failure between the two burns the token (usedAt stays,
    // usedBy nulls with the compensated User) — the owner re-issues an
    // Invite; no instance-level state is harmed.
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
  const currency = requireSupportedCurrency(fields.currency)
  const now = new Date()
  const householdId = crypto.randomUUID()
  try {
    // db.batch is a single atomic D1 transaction.
    await db.batch([
      db.insert(household).values({
        id: householdId,
        // The atomic bootstrap claim (issue #52): the CASE collapses the
        // NOT NULL name to NULL when any Household already exists, failing
        // this statement — and with it the whole batch — so two sign-ups
        // racing through the zero-Users gate can never both claim the
        // instance. The guard counts Households where the gate counts Users:
        // with the compensating delete above, a User without a Household is
        // always transient, so "a Household exists" is the durable form of
        // "the instance is claimed" — and unlike the gate's read, it can't
        // miss a competitor whose User insert hasn't landed yet.
        name: sql`case when exists (select 1 from ${household}) then null else ${householdName ?? `${newUser.name}'s Household`} end`,
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
