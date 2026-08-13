import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import { providers as drizzleProviders } from 'alchemy/Drizzle/Providers'
import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import type { HttpClientResponse } from 'effect/unstable/http/HttpClientResponse'
import { expect } from 'vite-plus/test'
import { schema } from '../../../alchemy.run.ts'

// The Test.make block and fresh-instance helpers shared by every server test
// file (docs/migrations-and-tests.md says to extract this once a second file
// appears). Providers/state match the backend stack (stacks/backend.ts).
// Stage defaults to "test"; CI sets TEST_STAGE to a per-PR stage so
// concurrent runs don't fight over the same resources.
//
// Local runs emulate the whole stack in workerd (dev mode) — nothing is
// created on Cloudflare. CI runs against real cloud resources and destroys
// them afterwards. Set ALCHEMY_DEV=1/0 to override either way.
export const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
  providers: Layer.mergeAll(Cloudflare.providers(), drizzleProviders()),
  state: Cloudflare.state(),
  stage: process.env.TEST_STAGE ?? 'test',
  dev: process.env.ALCHEMY_DEV !== undefined ? undefined : !process.env.CI,
})

// --- Fresh-instance scratch stack ---
// Self-serve sign-up is locked the moment a User exists (ADR 0004), so every
// test that mints one deploys its own pristine worker + D1 through
// `test.provider`'s scratch stack: private in-memory state guarantees a
// zero-User database on every run, torn down afterwards even on failure.
// Scratch stacks are keyed by test title, so instances never share state and
// fixed emails are safe.

const freshDatabase = Cloudflare.D1.Database(
  'FreshDB',
  Effect.map(schema, (s) => ({ migrationsDir: s.out })),
)

export const freshServer = Cloudflare.Worker('FreshServer', {
  main: './apps/server/src/index.ts',
  compatibility: { flags: ['nodejs_compat'] },
  env: {
    DB: freshDatabase,
    BETTER_AUTH_SECRET: Alchemy.makeRandom('FreshBetterAuthSecret'),
    WEB_ORIGIN: '',
  },
})

export const freshApiUrl = Effect.map(freshServer, (worker) => ({ apiUrl: worker.url }))

// --- HTTP request helpers ---

export interface Me {
  user: { id: string; email: string; name: string }
  household: { id: string; name: string; currency: string; dateFormat: string }
  role: string
}

// Better Auth's CSRF protection requires a trusted Origin on credentialed
// POSTs (Node's fetch sends sec-fetch-mode, which forces the check), so the
// tests send one exactly like a browser client would.
export const trustedOrigin = HttpClientRequest.setHeader('origin', 'http://localhost:3000')

export const withCookie = (cookie: string) => HttpClientRequest.setHeader('cookie', cookie)

export const signUpRequest = (
  apiUrl: string,
  email: string,
  name: string,
  // currency: null omits the field to prove the server requires it.
  options: { householdName?: string; currency?: string | null; inviteToken?: string } = {},
) => {
  const { householdName, currency = 'USD', inviteToken } = options
  return HttpClientRequest.post(`${apiUrl}/api/auth/sign-up/email`).pipe(
    trustedOrigin,
    HttpClientRequest.bodyJsonUnsafe({
      email,
      name,
      password: 'correct-horse-battery',
      ...(householdName !== undefined && { householdName }),
      ...(currency !== null && { currency }),
      ...(inviteToken !== undefined && { inviteToken }),
    }),
  )
}

export const signInRequest = (apiUrl: string, email: string) =>
  HttpClientRequest.post(`${apiUrl}/api/auth/sign-in/email`).pipe(
    trustedOrigin,
    HttpClientRequest.bodyJsonUnsafe({ email, password: 'correct-horse-battery' }),
  )

export const readMe = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => body as unknown as Me)

// Echo every cookie the server set (name is prefix-dependent in Better Auth,
// so don't hardcode it).
export const cookieHeader = (response: HttpClientResponse) =>
  Object.values(response.cookies.cookies)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ')

// Plain execute, no cold-start retry: executeWhenReady treats 404 as "edge
// not converged yet" and retries it away, so a test that ASSERTS a 404 must
// hit the (by then long warm) worker directly.
export const executeWarm = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return yield* client.execute(request)
  })

// --- Accounts helpers shared by the ledger suites ---

export interface AccountView {
  id: string
  name: string
  type: string
  kind: string
  openingBalance: number
  balance: number
  archivedAt: string | null
  createdAt: string
}

export const readAccount = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => (body as unknown as { account: AccountView }).account)

export const readAccounts = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => (body as unknown as { accounts: AccountView[] }).accounts)

export const createAccount = (apiUrl: string, cookie: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(
    HttpClientRequest.post(`${apiUrl}/api/accounts`).pipe(
      trustedOrigin,
      withCookie(cookie),
      HttpClientRequest.bodyJsonUnsafe(body),
    ),
  )

export const listAccounts = (apiUrl: string, cookie: string, query = '') =>
  Test.executeWhenReady(
    HttpClientRequest.get(`${apiUrl}/api/accounts${query}`).pipe(withCookie(cookie)),
  )

export const createTransaction = (apiUrl: string, cookie: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(
    HttpClientRequest.post(`${apiUrl}/api/transactions`).pipe(
      trustedOrigin,
      withCookie(cookie),
      HttpClientRequest.bodyJsonUnsafe(body),
    ),
  )

// Bootstrap an owner on a fresh instance and return their cookie + household.
export const signUpOwner = (
  apiUrl: string,
  email: string,
  options: { householdName?: string; currency?: string } = {},
) =>
  Effect.gen(function* () {
    const signUp = yield* Test.executeWhenReady(
      signUpRequest(apiUrl, email, 'Owner', {
        householdName: options.householdName ?? 'Invite House',
        ...(options.currency !== undefined && { currency: options.currency }),
      }),
    )
    expect(signUp.status).toBe(200)
    const cookie = cookieHeader(signUp)
    const me = yield* readMe(
      yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/me`).pipe(withCookie(cookie)),
      ),
    )
    return { cookie, householdId: me.household.id }
  })
