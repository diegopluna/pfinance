import * as Cloudflare from 'alchemy/Cloudflare'
import { providers as drizzleProviders } from 'alchemy/Drizzle/Providers'
import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import type { HttpClientResponse } from 'effect/unstable/http/HttpClientResponse'
import { expect } from 'vite-plus/test'
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
// between runs, so re-runs are fast no-op deploys.
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

// --- Auth (issue #3) ---
// Local dev-mode state (including D1 data) persists between runs, so every
// test signs up its own unique user instead of assuming a fresh database.

interface Me {
  user: { id: string; email: string; name: string }
  household: { id: string; name: string }
  role: string
}

// Better Auth's CSRF protection requires a trusted Origin on credentialed
// POSTs (Node's fetch sends sec-fetch-mode, which forces the check), so the
// tests send one exactly like a browser client would.
const trustedOrigin = HttpClientRequest.setHeader('origin', 'http://localhost:3000')

const signUpRequest = (apiUrl: string, email: string, name: string) =>
  HttpClientRequest.post(`${apiUrl}/api/auth/sign-up/email`).pipe(
    trustedOrigin,
    HttpClientRequest.bodyJsonUnsafe({ email, name, password: 'correct-horse-battery' }),
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

const uniqueEmail = () => `owner-${crypto.randomUUID().slice(0, 8)}@example.com`

test(
  'sign-up creates a session and a Household owned by the new user',
  Effect.gen(function* () {
    const { apiUrl = '' } = yield* stack
    const email = uniqueEmail()

    const signUp = yield* Test.executeWhenReady(signUpRequest(apiUrl, email, 'Test Owner'))
    expect(signUp.status).toBe(200)
    const cookie = cookieHeader(signUp)
    expect(cookie).not.toBe('')

    // The session resolves the caller's Household — sign-up created User,
    // Household, and owner Membership in one flow.
    const me = yield* Test.executeWhenReady(
      HttpClientRequest.get(`${apiUrl}/api/me`).pipe(HttpClientRequest.setHeader('cookie', cookie)),
    )
    expect(me.status).toBe(200)
    const body = yield* readMe(me)
    expect(body.user.email).toBe(email)
    expect(body.role).toBe('owner')
    expect(body.household.id).toBeTruthy()
    expect(body.household.name).toBe("Test Owner's Household")
  }),
  { timeout: 120_000 },
)

test(
  'sign-in issues a fresh session that resolves the same household',
  Effect.gen(function* () {
    const { apiUrl = '' } = yield* stack
    const email = uniqueEmail()

    const signUp = yield* Test.executeWhenReady(signUpRequest(apiUrl, email, 'Returning Owner'))
    expect(signUp.status).toBe(200)
    const firstMe = yield* readMe(
      yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/me`).pipe(
          HttpClientRequest.setHeader('cookie', cookieHeader(signUp)),
        ),
      ),
    )

    const signIn = yield* Test.executeWhenReady(signInRequest(apiUrl, email))
    expect(signIn.status).toBe(200)
    const cookie = cookieHeader(signIn)
    expect(cookie).not.toBe('')

    const me = yield* Test.executeWhenReady(
      HttpClientRequest.get(`${apiUrl}/api/me`).pipe(HttpClientRequest.setHeader('cookie', cookie)),
    )
    expect(me.status).toBe(200)
    const body = yield* readMe(me)
    expect(body.user.email).toBe(email)
    expect(body.household.id).toBe(firstMe.household.id)
  }),
  { timeout: 120_000 },
)

test(
  'sign-in with a wrong password is rejected',
  Effect.gen(function* () {
    const { apiUrl = '' } = yield* stack
    const email = uniqueEmail()

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
