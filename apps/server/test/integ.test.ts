import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import type { HttpClientResponse } from 'effect/unstable/http/HttpClientResponse'
import { expect } from 'vite-plus/test'
import Stack from '../../../stacks/backend.ts'
import {
  afterAll,
  beforeAll,
  cookieHeader,
  deploy,
  destroy,
  executeWarm,
  freshApiUrl,
  readMe,
  signInRequest,
  signUpOwner,
  signUpRequest,
  test,
  trustedOrigin,
  withCookie,
} from './harness.ts'

// Deploy once for the whole file. Locally the emulated stack's state persists
// between runs, so re-runs are fast no-op deploys. Only tests that never mint
// a User run against this shared stack — see the fresh-instance section below.
const stack = beforeAll(deploy(Stack), { timeout: 600_000 })

// Tear down only in CI (GitHub Actions sets CI=true); local dev-mode runs
// keep their state for fast iteration and hold no cloud resources anyway.
afterAll.skipIf(!process.env.CI)(destroy(Stack), { timeout: 600_000 })

test(
  'health endpoint round-trips the worker and its D1 binding',
  Effect.gen(function* () {
    const { apiUrl } = yield* stack

    // getWhenReady retries through the workers.dev cold-start window.
    const response = yield* Test.getWhenReady(`${apiUrl}/health`)
    expect(response.status).toBe(200)

    // /health queries the migrated `meta` table, so 200 + ok proves the
    // worker, its D1 binding, and the applied migration end to end.
    const body = yield* response.json
    expect(body).toEqual({ ok: true })
  }),
  { timeout: 120_000 },
)

test(
  'unauthenticated requests to protected routes are rejected',
  Effect.gen(function* () {
    const { apiUrl = '' } = yield* stack

    const me = yield* Test.executeWhenReady(HttpClientRequest.get(`${apiUrl}/api/me`))
    expect(me.status).toBe(401)

    // A bogus session token is rejected the same way (both cookie names,
    // since the prefix depends on http vs https).
    const forged = yield* Test.executeWhenReady(
      HttpClientRequest.get(`${apiUrl}/api/me`).pipe(
        HttpClientRequest.setHeader(
          'cookie',
          'better-auth.session_token=forged; __Secure-better-auth.session_token=forged',
        ),
      ),
    )
    expect(forged.status).toBe(401)
  }),
  { timeout: 120_000 },
)

// --- Auth & sign-up gating (issues #3 and #4, ADR 0004) ---
// Self-serve sign-up is locked the moment a User exists, so every test that
// mints one deploys its own pristine worker + D1 through `test.provider`'s
// scratch stack: private in-memory state guarantees a zero-User database on
// every run, torn down afterwards even on failure (freshApiUrl and the
// request helpers live in harness.ts, shared with the other test files).

const signUpStatus = (apiUrl: string) =>
  Effect.flatMap(
    Test.executeWhenReady(HttpClientRequest.get(`${apiUrl}/api/sign-up-status`)),
    (response) => {
      expect(response.status).toBe(200)
      return Effect.map(response.json, (body) => body as { allowed: boolean })
    },
  )

test.provider(
  'sign-up creates a session and a Household owned by the new user',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const email = 'owner@example.com'

      const signUp = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, email, 'Test Owner', { householdName: 'Casa Test', currency: 'BRL' }),
      )
      expect(signUp.status).toBe(200)
      const cookie = cookieHeader(signUp)
      expect(cookie).not.toBe('')

      // The session resolves the caller's Household — sign-up created User,
      // Household, and owner Membership in one flow.
      const me = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/me`).pipe(
          HttpClientRequest.setHeader('cookie', cookie),
        ),
      )
      expect(me.status).toBe(200)
      const body = yield* readMe(me)
      expect(body.user.email).toBe(email)
      expect(body.role).toBe('owner')
      expect(body.household.id).toBeTruthy()
      // The household carries the name and Currency chosen at sign-up —
      // the API reports the Currency so clients can format every amount.
      expect(body.household.name).toBe('Casa Test')
      expect(body.household.currency).toBe('BRL')
    }),
  { timeout: 600_000 },
)

test.provider(
  'sign-in issues a fresh session that resolves the same household',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const email = 'returning-owner@example.com'

      const signUp = yield* Test.executeWhenReady(signUpRequest(apiUrl, email, 'Returning Owner'))
      expect(signUp.status).toBe(200)
      const firstMe = yield* readMe(
        yield* Test.executeWhenReady(
          HttpClientRequest.get(`${apiUrl}/api/me`).pipe(
            HttpClientRequest.setHeader('cookie', cookieHeader(signUp)),
          ),
        ),
      )

      // No householdName sent at sign-up, so the default name kicked in.
      expect(firstMe.household.name).toBe("Returning Owner's Household")

      const signIn = yield* Test.executeWhenReady(signInRequest(apiUrl, email))
      expect(signIn.status).toBe(200)
      const cookie = cookieHeader(signIn)
      expect(cookie).not.toBe('')

      const me = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/me`).pipe(
          HttpClientRequest.setHeader('cookie', cookie),
        ),
      )
      expect(me.status).toBe(200)
      const body = yield* readMe(me)
      expect(body.user.email).toBe(email)
      expect(body.household.id).toBe(firstMe.household.id)
    }),
  { timeout: 600_000 },
)

test.provider(
  'sign-in with a wrong password is rejected',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const email = 'wrong-password@example.com'

      const signUp = yield* Test.executeWhenReady(signUpRequest(apiUrl, email, 'Wrong Password'))
      expect(signUp.status).toBe(200)

      const signIn = yield* Test.executeWhenReady(
        HttpClientRequest.post(`${apiUrl}/api/auth/sign-in/email`).pipe(
          trustedOrigin,
          HttpClientRequest.bodyJsonUnsafe({ email, password: 'not-the-password' }),
        ),
      )
      expect(signIn.status).toBe(401)
    }),
  { timeout: 600_000 },
)

test.provider(
  'sign-out revokes the session: the same cookie is rejected afterwards',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const email = 'departing-owner@example.com'

      const signUp = yield* Test.executeWhenReady(signUpRequest(apiUrl, email, 'Departing Owner'))
      expect(signUp.status).toBe(200)

      // A returning visit: sign-in issues the session under test (story 17 —
      // the session persists across visits until sign-out ends it).
      const signIn = yield* Test.executeWhenReady(signInRequest(apiUrl, email))
      expect(signIn.status).toBe(200)
      const cookie = cookieHeader(signIn)
      expect(cookie).not.toBe('')

      const before = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/me`).pipe(withCookie(cookie)),
      )
      expect(before.status).toBe(200)

      const signOut = yield* Test.executeWhenReady(
        HttpClientRequest.post(`${apiUrl}/api/auth/sign-out`).pipe(
          trustedOrigin,
          withCookie(cookie),
          HttpClientRequest.bodyJsonUnsafe({}),
        ),
      )
      expect(signOut.status).toBe(200)

      // Replaying the pre-sign-out cookie proves the server revoked the
      // session row — a browser merely clearing its cookie wouldn't 401 here.
      const after = yield* executeWarm(
        HttpClientRequest.get(`${apiUrl}/api/me`).pipe(withCookie(cookie)),
      )
      expect(after.status).toBe(401)
    }),
  { timeout: 600_000 },
)

test.provider(
  'bootstrap then locked: the first sign-up claims the instance, then the gate closes',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)

      // Zero Users: the bootstrap exception opens the gate…
      const before = yield* signUpStatus(apiUrl)
      expect(before.allowed).toBe(true)

      // …so the first sign-up succeeds and claims the instance.
      const first = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'founder@example.com', 'Founder', {
          householdName: 'Founding Household',
        }),
      )
      expect(first.status).toBe(200)

      // A User now exists: the gate reports closed…
      const after = yield* signUpStatus(apiUrl)
      expect(after.allowed).toBe(false)

      // …and further self-serve sign-ups are rejected.
      const second = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'latecomer@example.com', 'Latecomer'),
      )
      expect(second.status).toBe(403)

      // The founder's session still works — the gate never touches sign-in.
      const me = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/me`).pipe(
          HttpClientRequest.setHeader('cookie', cookieHeader(first)),
        ),
      )
      expect(me.status).toBe(200)
      const founder = yield* readMe(me)
      expect(founder.role).toBe('owner')
      expect(founder.household.name).toBe('Founding Household')
    }),
  { timeout: 600_000 },
)

test.provider(
  'sign-up requires a supported Currency for the new Household',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)

      // The Currency is chosen at creation and immutable afterwards (ADR
      // 0002), so a missing or unsupported code must fail the sign-up —
      // before any User is created.
      const missing = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'no-currency@example.com', 'No Currency', { currency: null }),
      )
      expect(missing.status).toBe(400)

      const bogus = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'doge@example.com', 'Doge Fan', { currency: 'DOGE' }),
      )
      expect(bogus.status).toBe(400)

      // Neither rejection minted a User, so the bootstrap slot is still open
      // and a valid choice claims it — including a 0-exponent currency.
      const valid = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'yen-owner@example.com', 'Yen Owner', { currency: 'JPY' }),
      )
      expect(valid.status).toBe(200)

      const me = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/me`).pipe(
          HttpClientRequest.setHeader('cookie', cookieHeader(valid)),
        ),
      )
      expect(me.status).toBe(200)
      const body = yield* readMe(me)
      expect(body.household.currency).toBe('JPY')
    }),
  { timeout: 600_000 },
)

// --- Invites & member management (issue #6, ADR 0004 §2) ---
// Same scratch-stack pattern: every test mints Users, so each deploys a
// pristine instance. The owner signs up through the bootstrap exception, then
// everyone else arrives via Invites.

interface InviteInfo {
  valid: boolean
  reason?: string
  householdName?: string
}

interface CreatedInvite {
  invite: { id: string; token: string; expiresAt: string; createdAt: string }
}

const createInvite = (apiUrl: string, cookie: string, expiresInSeconds?: number) =>
  Test.executeWhenReady(
    HttpClientRequest.post(`${apiUrl}/api/invites`).pipe(
      trustedOrigin,
      withCookie(cookie),
      HttpClientRequest.bodyJsonUnsafe(expiresInSeconds === undefined ? {} : { expiresInSeconds }),
    ),
  )

const readCreatedInvite = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => body as unknown as CreatedInvite)

const inviteInfo = (apiUrl: string, token: string) =>
  Effect.flatMap(
    Test.executeWhenReady(
      HttpClientRequest.get(`${apiUrl}/api/invite-info?token=${encodeURIComponent(token)}`),
    ),
    (response) => {
      expect(response.status).toBe(200)
      return Effect.map(response.json, (body) => body as unknown as InviteInfo)
    },
  )

test.provider(
  'a valid Invite registers a Member while sign-ups are locked, exactly once',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const owner = yield* signUpOwner(apiUrl, 'invite-owner@example.com')

      // The instance is claimed, so the self-serve gate is closed…
      const status = yield* signUpStatus(apiUrl)
      expect(status.allowed).toBe(false)

      const created = yield* createInvite(apiUrl, owner.cookie)
      expect(created.status).toBe(200)
      const { invite } = yield* readCreatedInvite(created)
      expect(invite.token).toBeTruthy()

      // …but the Invite link identifies itself to the sign-up screen…
      const info = yield* inviteInfo(apiUrl, invite.token)
      expect(info.valid).toBe(true)
      expect(info.householdName).toBe('Invite House')

      // …and redeems even though sign-ups are off. No currency: the recipient
      // joins the existing Household instead of creating one (ADR 0002).
      const redeem = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'joiner@example.com', 'Joiner', {
          currency: null,
          inviteToken: invite.token,
        }),
      )
      expect(redeem.status).toBe(200)

      const joiner = yield* readMe(
        yield* Test.executeWhenReady(
          HttpClientRequest.get(`${apiUrl}/api/me`).pipe(withCookie(cookieHeader(redeem))),
        ),
      )
      expect(joiner.role).toBe('member')
      expect(joiner.household.id).toBe(owner.householdId)

      // Single-use: the consumed Invite rejects the next redemption…
      const again = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'second-joiner@example.com', 'Second Joiner', {
          currency: null,
          inviteToken: invite.token,
        }),
      )
      expect(again.status).toBe(403)

      // …and reports why.
      const usedInfo = yield* inviteInfo(apiUrl, invite.token)
      expect(usedInfo.valid).toBe(false)
      expect(usedInfo.reason).toBe('used')

      // A made-up token never validates or redeems.
      const bogusInfo = yield* inviteInfo(apiUrl, 'not-a-real-token')
      expect(bogusInfo.valid).toBe(false)
      const bogusRedeem = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'gatecrasher@example.com', 'Gatecrasher', {
          currency: null,
          inviteToken: 'not-a-real-token',
        }),
      )
      expect(bogusRedeem.status).toBe(403)
    }),
  { timeout: 600_000 },
)

test.provider(
  'expired and revoked Invites are rejected and leave the pending list',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const owner = yield* signUpOwner(apiUrl, 'expiry-owner@example.com')

      // Expiry: a 1-second Invite lapses before redemption.
      const shortLived = yield* readCreatedInvite(yield* createInvite(apiUrl, owner.cookie, 1))
      yield* Effect.sleep('2 seconds')
      const expiredRedeem = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'too-late@example.com', 'Too Late', {
          currency: null,
          inviteToken: shortLived.invite.token,
        }),
      )
      expect(expiredRedeem.status).toBe(403)
      const expiredInfo = yield* inviteInfo(apiUrl, shortLived.invite.token)
      expect(expiredInfo.valid).toBe(false)
      expect(expiredInfo.reason).toBe('expired')

      // Revocation: the owner withdraws a pending Invite before it's used.
      const revocable = yield* readCreatedInvite(yield* createInvite(apiUrl, owner.cookie))
      const revoke = yield* Test.executeWhenReady(
        HttpClientRequest.delete(`${apiUrl}/api/invites/${revocable.invite.id}`).pipe(
          trustedOrigin,
          withCookie(owner.cookie),
        ),
      )
      expect(revoke.status).toBe(200)

      const revokedRedeem = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'uninvited@example.com', 'Uninvited', {
          currency: null,
          inviteToken: revocable.invite.token,
        }),
      )
      expect(revokedRedeem.status).toBe(403)
      const revokedInfo = yield* inviteInfo(apiUrl, revocable.invite.token)
      expect(revokedInfo.valid).toBe(false)
      expect(revokedInfo.reason).toBe('revoked')

      // Neither the expired nor the revoked Invite is pending anymore.
      const list = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/invites`).pipe(withCookie(owner.cookie)),
      )
      expect(list.status).toBe(200)
      const pending = (yield* list.json) as unknown as { invites: Array<{ id: string }> }
      expect(pending.invites).toEqual([])
    }),
  { timeout: 600_000 },
)

test.provider(
  'only the owner manages Invites and Members; a removed Member can be re-invited',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const owner = yield* signUpOwner(apiUrl, 'boss@example.com')

      const first = yield* readCreatedInvite(yield* createInvite(apiUrl, owner.cookie))
      const joined = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'plain-member@example.com', 'Plain Member', {
          currency: null,
          inviteToken: first.invite.token,
        }),
      )
      expect(joined.status).toBe(200)
      const memberCookie = cookieHeader(joined)

      // A non-owner Member can't touch the management surface.
      const memberCreate = yield* createInvite(apiUrl, memberCookie)
      expect(memberCreate.status).toBe(403)
      const memberList = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/invites`).pipe(withCookie(memberCookie)),
      )
      expect(memberList.status).toBe(403)
      const memberMembers = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/members`).pipe(withCookie(memberCookie)),
      )
      expect(memberMembers.status).toBe(403)

      // The owner sees both Members and the remaining pending Invites.
      const pendingInvite = yield* readCreatedInvite(yield* createInvite(apiUrl, owner.cookie))
      const members = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/members`).pipe(withCookie(owner.cookie)),
      )
      expect(members.status).toBe(200)
      const memberBody = (yield* members.json) as unknown as {
        members: Array<{ id: string; email: string; role: string }>
      }
      expect(memberBody.members.map((entry) => [entry.email, entry.role])).toEqual([
        ['boss@example.com', 'owner'],
        ['plain-member@example.com', 'member'],
      ])
      const invites = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/invites`).pipe(withCookie(owner.cookie)),
      )
      const inviteBody = (yield* invites.json) as unknown as { invites: Array<{ id: string }> }
      expect(inviteBody.invites.map((entry) => entry.id)).toEqual([pendingInvite.invite.id])

      // Members can't remove Members — and nobody removes the owner.
      const target = memberBody.members.find((entry) => entry.role === 'member')
      const ownerRow = memberBody.members.find((entry) => entry.role === 'owner')
      const memberRemove = yield* Test.executeWhenReady(
        HttpClientRequest.delete(`${apiUrl}/api/members/${target?.id}`).pipe(
          trustedOrigin,
          withCookie(memberCookie),
        ),
      )
      expect(memberRemove.status).toBe(403)
      const removeOwner = yield* Test.executeWhenReady(
        HttpClientRequest.delete(`${apiUrl}/api/members/${ownerRow?.id}`).pipe(
          trustedOrigin,
          withCookie(owner.cookie),
        ),
      )
      expect(removeOwner.status).toBe(400)

      // The owner removes the Member: their session stops resolving…
      const remove = yield* Test.executeWhenReady(
        HttpClientRequest.delete(`${apiUrl}/api/members/${target?.id}`).pipe(
          trustedOrigin,
          withCookie(owner.cookie),
        ),
      )
      expect(remove.status).toBe(200)
      const evicted = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/me`).pipe(withCookie(memberCookie)),
      )
      expect(evicted.status).toBe(401)

      // …and removal deleted their User, so the same email can be re-invited
      // (a lingering User row would block re-registration on the unique email).
      const second = yield* readCreatedInvite(yield* createInvite(apiUrl, owner.cookie))
      const rejoined = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'plain-member@example.com', 'Plain Member', {
          currency: null,
          inviteToken: second.invite.token,
        }),
      )
      expect(rejoined.status).toBe(200)
    }),
  { timeout: 600_000 },
)

// --- Household date format (issue #31) ---

const patchDateFormat = (apiUrl: string, cookie: string, dateFormat: unknown) =>
  Test.executeWhenReady(
    HttpClientRequest.patch(`${apiUrl}/api/household`).pipe(
      trustedOrigin,
      withCookie(cookie),
      HttpClientRequest.bodyJsonUnsafe({ dateFormat }),
    ),
  )

const meFor = (apiUrl: string, cookie: string) =>
  Effect.flatMap(
    Test.executeWhenReady(HttpClientRequest.get(`${apiUrl}/api/me`).pipe(withCookie(cookie))),
    readMe,
  )

test.provider(
  'Household date format: defaults to system, any Member may change it, bad values rejected',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const owner = yield* signUpOwner(apiUrl, 'date-format-owner@example.com')

      // Ships defaulted: a Household that never visited Settings renders
      // exactly as before the column existed.
      const initial = yield* meFor(apiUrl, owner.cookie)
      expect(initial.household.dateFormat).toBe('system')

      // Household data: no session, no access.
      const anonymous = yield* executeWarm(
        HttpClientRequest.patch(`${apiUrl}/api/household`).pipe(
          trustedOrigin,
          HttpClientRequest.bodyJsonUnsafe({ dateFormat: 'dmy' }),
        ),
      )
      expect(anonymous.status).toBe(401)

      const patched = yield* patchDateFormat(apiUrl, owner.cookie, 'dmy')
      expect(patched.status).toBe(200)
      const patchedBody = (yield* patched.json) as unknown as {
        household: { dateFormat: string }
      }
      expect(patchedBody.household.dateFormat).toBe('dmy')

      // The write persisted: a fresh read through /api/me agrees.
      const after = yield* meFor(apiUrl, owner.cookie)
      expect(after.household.dateFormat).toBe('dmy')

      // Outside the vocabulary (date-formats.ts) → 400, preference unchanged.
      const bogus = yield* patchDateFormat(apiUrl, owner.cookie, 'stardate')
      expect(bogus.status).toBe(400)
      const missing = yield* patchDateFormat(apiUrl, owner.cookie, undefined)
      expect(missing.status).toBe(400)
      expect((yield* meFor(apiUrl, owner.cookie)).household.dateFormat).toBe('dmy')

      // Member-level, not owner-only: presentation of the shared ledger is
      // every Member's, like the ledger itself (CONTEXT.md) — so a plain
      // Member may change it too.
      const invited = yield* readCreatedInvite(yield* createInvite(apiUrl, owner.cookie))
      const joined = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'date-format-member@example.com', 'Member', {
          currency: null,
          inviteToken: invited.invite.token,
        }),
      )
      expect(joined.status).toBe(200)
      const memberPatch = yield* patchDateFormat(apiUrl, cookieHeader(joined), 'ymd')
      expect(memberPatch.status).toBe(200)
      expect((yield* meFor(apiUrl, owner.cookie)).household.dateFormat).toBe('ymd')
    }),
  { timeout: 600_000 },
)
