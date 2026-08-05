import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import { providers as drizzleProviders } from 'alchemy/Drizzle/Providers'
import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import type { HttpClientResponse } from 'effect/unstable/http/HttpClientResponse'
import { expect } from 'vite-plus/test'
import { schema } from '../../../alchemy.run.ts'
import Stack from '../../../stacks/backend.ts'

// Same providers/state as the backend stack (stacks/backend.ts) — the
// server tests deploy only Schema → D1 → Worker, not the full product
// stack. Stage defaults to "test"; CI sets TEST_STAGE to a per-PR stage so
// concurrent runs don't fight over the same resources.
//
// Local runs emulate the whole stack in workerd (dev mode) — nothing is
// created on Cloudflare. CI runs against real cloud resources and destroys
// them afterwards. Set ALCHEMY_DEV=1/0 to override either way.
const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
  providers: Layer.mergeAll(Cloudflare.providers(), drizzleProviders()),
  state: Cloudflare.state(),
  stage: process.env.TEST_STAGE ?? 'test',
  dev: process.env.ALCHEMY_DEV !== undefined ? undefined : !process.env.CI,
})

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
// every run, torn down afterwards even on failure. The declarations below
// deploy once per test — each scratch stack is keyed by its test title, so
// the instances never share state, and fixed emails are safe.

interface Me {
  user: { id: string; email: string; name: string }
  household: { id: string; name: string }
  role: string
}

// Better Auth's CSRF protection requires a trusted Origin on credentialed
// POSTs (Node's fetch sends sec-fetch-mode, which forces the check), so the
// tests send one exactly like a browser client would.
const trustedOrigin = HttpClientRequest.setHeader('origin', 'http://localhost:3000')

const signUpRequest = (apiUrl: string, email: string, name: string, householdName?: string) =>
  HttpClientRequest.post(`${apiUrl}/api/auth/sign-up/email`).pipe(
    trustedOrigin,
    HttpClientRequest.bodyJsonUnsafe({
      email,
      name,
      password: 'correct-horse-battery',
      ...(householdName !== undefined && { householdName }),
    }),
  )

const signInRequest = (apiUrl: string, email: string) =>
  HttpClientRequest.post(`${apiUrl}/api/auth/sign-in/email`).pipe(
    trustedOrigin,
    HttpClientRequest.bodyJsonUnsafe({ email, password: 'correct-horse-battery' }),
  )

const readMe = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => body as unknown as Me)

// Echo every cookie the server set (name is prefix-dependent in Better Auth,
// so don't hardcode it).
const cookieHeader = (response: HttpClientResponse) =>
  Object.values(response.cookies.cookies)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')

const signUpStatus = (apiUrl: string) =>
  Effect.flatMap(
    Test.executeWhenReady(HttpClientRequest.get(`${apiUrl}/api/sign-up-status`)),
    (response) => {
      expect(response.status).toBe(200)
      return Effect.map(response.json, (body) => body as { allowed: boolean })
    },
  )

const freshDatabase = Cloudflare.D1.Database(
  'FreshDB',
  Effect.map(schema, (s) => ({ migrationsDir: s.out })),
)

const freshServer = Cloudflare.Worker('FreshServer', {
  main: './apps/server/src/index.ts',
  compatibility: { flags: ['nodejs_compat'] },
  env: {
    DB: freshDatabase,
    BETTER_AUTH_SECRET: Alchemy.makeRandom('FreshBetterAuthSecret'),
    WEB_ORIGIN: '',
  },
})

const freshApiUrl = Effect.map(freshServer, (worker) => ({ apiUrl: worker.url }))

test.provider(
  'sign-up creates a session and a Household owned by the new user',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const email = 'owner@example.com'

      const signUp = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, email, 'Test Owner', 'Casa Test'),
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
      // The household carries the name chosen at sign-up.
      expect(body.household.name).toBe('Casa Test')
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
  'bootstrap then locked: the first sign-up claims the instance, then the gate closes',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)

      // Zero Users: the bootstrap exception opens the gate…
      const before = yield* signUpStatus(apiUrl)
      expect(before.allowed).toBe(true)

      // …so the first sign-up succeeds and claims the instance.
      const first = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'founder@example.com', 'Founder', 'Founding Household'),
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
