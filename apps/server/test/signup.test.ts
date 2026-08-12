import { category, household, invite, member, user, type Db } from '@pfinance/db'
import { APIError } from 'better-auth/api'
import { expect, test } from 'vite-plus/test'
import { selfServeSignUpAllowed } from '../src/signup-gate.ts'
import { attachMember } from '../src/signup.ts'
import { createTestDb, seedLedger } from './db-harness.ts'

// --- Sign-up bootstrap edges (issue #52) ---
// Unit tests against the in-memory libsql harness (db-harness.ts). The seam
// is attachMember — the user.create.after hook's body — called the way
// Better Auth calls it: the User row is already inserted when it runs, so
// each test plants that row first, exactly like the adapter does.

const insertUser = async (db: Db, name: string) => {
  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(user).values({
    id,
    name,
    email: `${id}@example.com`,
    createdAt: now,
    updatedAt: now,
  })
  return { id, name }
}

test('the bootstrap claim creates the Household, its owner Member, and the seeded Categories', async () => {
  const db = await createTestDb()
  const deployer = await insertUser(db, 'Deployer')

  await attachMember(db, deployer, { householdName: 'Casa', currency: 'EUR' })

  const households = await db.select().from(household)
  expect(households).toMatchObject([{ name: 'Casa', currency: 'EUR' }])
  expect(await db.select().from(member)).toMatchObject([
    { userId: deployer.id, householdId: households[0]?.id, role: 'owner' },
  ])
  // The default Category vocabulary arrives in the same claim (ADR 0003).
  expect((await db.select().from(category)).length).toBeGreaterThan(0)
})

test('two racing bootstrap sign-ups: exactly one claims the instance, the loser gets the normal 403', async () => {
  const db = await createTestDb()
  // The worst interleaving: both sign-ups passed the zero-Users gate before
  // either after hook ran, so both User rows already exist.
  const first = await insertUser(db, 'First')
  const second = await insertUser(db, 'Second')

  const outcomes = await Promise.allSettled([
    attachMember(db, first, { currency: 'USD' }),
    attachMember(db, second, { currency: 'USD' }),
  ])

  // Exactly one wins; the loser gets the same 403 a post-claim sign-up gets.
  const losses = outcomes.filter((outcome) => outcome.status === 'rejected')
  expect(outcomes.length - losses.length).toBe(1)
  expect(losses).toHaveLength(1)
  const loss = losses[0]?.reason as APIError
  expect(loss).toBeInstanceOf(APIError)
  expect(loss.body?.message).toBe('Sign-ups are disabled on this instance.')

  // One claimed Household, owned by the winner.
  const households = await db.select().from(household)
  expect(households).toHaveLength(1)
  const members = await db.select().from(member)
  expect(members).toMatchObject([{ householdId: households[0]?.id, role: 'owner' }])

  // The loser's User row is compensated away — no orphan the session
  // middleware would 401 forever.
  const users = await db.select({ id: user.id }).from(user)
  expect(users).toMatchObject([{ id: members[0]?.userId }])
})

test('a failed invite redemption leaves zero orphan Users and the sign-up gate in its prior state', async () => {
  const db = await createTestDb()
  const seeded = await seedLedger(db)
  // An Invite that was pending at the before hook's check but is consumed by
  // the time attachMember redeems it — the acknowledged race (auth.ts).
  const now = new Date()
  await db.insert(invite).values({
    id: crypto.randomUUID(),
    token: 'raced-away',
    householdId: seeded.householdId,
    createdBy: seeded.userId,
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    usedAt: now,
    usedBy: seeded.userId,
  })
  const gateBefore = await selfServeSignUpAllowed(db)
  const recipient = await insertUser(db, 'Latecomer')

  await expect(attachMember(db, recipient, { inviteToken: 'raced-away' })).rejects.toMatchObject({
    body: { message: 'This invite is no longer valid.' },
  })

  // No orphan User survives the failure, and the gate did not move.
  const users = await db.select({ id: user.id }).from(user)
  expect(users).toMatchObject([{ id: seeded.userId }])
  expect(await selfServeSignUpAllowed(db)).toBe(gateBefore)
})

test('a failed bootstrap claim reopens the bootstrap window instead of locking the instance', async () => {
  const db = await createTestDb()
  const applicant = await insertUser(db, 'Applicant')

  // The after hook re-checks the Currency; on a fresh instance its failure
  // used to strand an orphan User and close the gate for everyone, forever.
  await expect(attachMember(db, applicant, { currency: 'DOGE' })).rejects.toMatchObject({
    body: { message: 'Choose a supported currency for your household.' },
  })

  expect(await db.select().from(user)).toHaveLength(0)
  expect(await selfServeSignUpAllowed(db)).toBe(true)
})
