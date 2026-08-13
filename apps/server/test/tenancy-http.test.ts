import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import { expect } from 'vite-plus/test'
import {
  createAccount,
  createTransaction,
  executeWarm,
  freshApiUrl,
  listAccounts,
  readAccount,
  readAccounts,
  signUpOwner,
  test,
  trustedOrigin,
  withCookie,
} from './harness.ts'

// --- Household scoping at the HTTP seam (issue #55) ---
// scope.test.ts proves cross-Household isolation at the module seam with two
// real Households in one database — a setup ADR 0004's sign-up lock makes
// impossible over HTTP, where one instance holds exactly one Household. But
// a route handler that forgot owned.* / c.var.scope would pass that suite
// green, so this file pins the routes themselves: every :id-taking route
// answers its own 404 for an id outside the Household, and every
// cross-entity reference in a body is verified before the write. To this
// instance a fabricated id IS a foreign Household's id — a second scratch
// instance would bind a disjoint D1, so even its real ids arrive here
// equally unknown, which is why issue #55's two-instance stretch buys no
// extra proof. Asserting the handler's error message alongside the status
// pins that the rejection came from the route, not a workers.dev edge 404.

const authedGet = (apiUrl: string, cookie: string, path: string) =>
  HttpClientRequest.get(`${apiUrl}${path}`).pipe(withCookie(cookie))

const authedPost = (
  apiUrl: string,
  cookie: string,
  path: string,
  body: Record<string, unknown> = {},
) =>
  HttpClientRequest.post(`${apiUrl}${path}`).pipe(
    trustedOrigin,
    withCookie(cookie),
    HttpClientRequest.bodyJsonUnsafe(body),
  )

const authedPatch = (apiUrl: string, cookie: string, path: string, body: Record<string, unknown>) =>
  HttpClientRequest.patch(`${apiUrl}${path}`).pipe(
    trustedOrigin,
    withCookie(cookie),
    HttpClientRequest.bodyJsonUnsafe(body),
  )

const authedDelete = (apiUrl: string, cookie: string, path: string) =>
  HttpClientRequest.delete(`${apiUrl}${path}`).pipe(trustedOrigin, withCookie(cookie))

// One rejected probe: status and the handler's own error message assert
// together, so a failure prints both at the offending line.
const probe = (request: HttpClientRequest.HttpClientRequest, status: number, error: string) =>
  Effect.gen(function* () {
    // 404-asserting probes must hit the (by then long warm) worker directly —
    // executeWhenReady would retry away exactly the 404 they assert. Every
    // other status rides whenReady past edge placeholder 404s (issue #68).
    const response = yield* status === 404 ? executeWarm(request) : Test.executeWhenReady(request)
    const body = (yield* response.json) as unknown as { error?: string }
    expect({ status: response.status, error: body.error }).toEqual({ status, error })
  })

test.provider(
  'foreign ids over HTTP: every :id route and body reference reads as unknown',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const { cookie } = yield* signUpOwner(apiUrl, 'sole-owner@example.com')

      // The Household's real rows, one per probed entity — proving each
      // rejection is about the id being foreign, not the table being empty,
      // and giving the body-reference probes real targets to patch.
      const checking = yield* readAccount(
        yield* createAccount(apiUrl, cookie, {
          name: 'Checking',
          type: 'checking',
          openingBalance: 0,
        }),
      )
      const savings = yield* readAccount(
        yield* createAccount(apiUrl, cookie, {
          name: 'Savings',
          type: 'savings',
          openingBalance: 0,
        }),
      )
      const createdTransaction = yield* createTransaction(apiUrl, cookie, {
        accountId: checking.id,
        date: '2026-03-05',
        amount: -700,
        description: 'Market',
      })
      expect(createdTransaction.status).toBe(200)
      const { transaction } = (yield* createdTransaction.json) as unknown as {
        transaction: { id: string }
      }
      // Setup writes and success reads go through executeWhenReady: edge
      // convergence isn't sticky, so a request on the seconds-old fresh
      // worker can still land on a PoP serving the workers.dev placeholder
      // 404 (seen in CI, issue #68). Only the probes use the plain execute,
      // since whenReady would retry away exactly the 404s they assert.
      const createdTransfer = yield* Test.executeWhenReady(
        authedPost(apiUrl, cookie, '/api/transfers', {
          fromAccountId: checking.id,
          toAccountId: savings.id,
          amount: 1000,
          date: '2026-03-06',
        }),
      )
      expect(createdTransfer.status).toBe(200)
      const { transfer } = (yield* createdTransfer.json) as unknown as {
        transfer: { id: string }
      }
      const createdImport = yield* Test.executeWhenReady(
        authedPost(apiUrl, cookie, '/api/imports', {
          accountId: checking.id,
          fileName: 'statement.csv',
          csv: 'date,description,amount\n2026-03-07,Coffee,-350\n',
        }),
      )
      expect(createdImport.status).toBe(200)
      const createdInvite = yield* Test.executeWhenReady(authedPost(apiUrl, cookie, '/api/invites'))
      expect(createdInvite.status).toBe(200)

      // What a foreign Household's id looks like from this side of the seam.
      const foreignId = crypto.randomUUID()

      // --- :id in the path: each handler's own 404, per route ---
      yield* probe(
        authedPatch(apiUrl, cookie, `/api/accounts/${foreignId}`, { name: 'Intruder' }),
        404,
        'Account not found.',
      )
      yield* probe(
        authedPost(apiUrl, cookie, `/api/accounts/${foreignId}/archive`),
        404,
        'Account not found.',
      )
      yield* probe(
        authedPost(apiUrl, cookie, `/api/accounts/${foreignId}/unarchive`),
        404,
        'Account not found.',
      )

      yield* probe(
        authedPatch(apiUrl, cookie, `/api/transactions/${foreignId}`, { description: 'Hijack' }),
        404,
        'Transaction not found.',
      )
      yield* probe(
        authedDelete(apiUrl, cookie, `/api/transactions/${foreignId}`),
        404,
        'Transaction not found.',
      )

      yield* probe(
        authedPatch(apiUrl, cookie, `/api/transfers/${foreignId}`, { amount: 1 }),
        404,
        'Transfer not found.',
      )
      yield* probe(
        authedDelete(apiUrl, cookie, `/api/transfers/${foreignId}`),
        404,
        'Transfer not found.',
      )

      yield* probe(authedGet(apiUrl, cookie, `/api/imports/${foreignId}`), 404, 'Import not found.')
      yield* probe(
        authedPost(apiUrl, cookie, `/api/imports/${foreignId}/preview`, {
          dateColumn: 0,
          descriptionColumn: 1,
          amountColumn: 2,
        }),
        404,
        'Import not found.',
      )
      yield* probe(
        authedPost(apiUrl, cookie, `/api/imports/${foreignId}/confirm`),
        404,
        'Import not found.',
      )
      yield* probe(
        authedDelete(apiUrl, cookie, `/api/imports/${foreignId}`),
        404,
        'Import not found.',
      )

      yield* probe(
        authedPatch(apiUrl, cookie, `/api/categories/${foreignId}`, { name: 'Takeover' }),
        404,
        'Category not found.',
      )
      yield* probe(
        authedPost(apiUrl, cookie, `/api/categories/${foreignId}/archive`),
        404,
        'Category not found.',
      )
      yield* probe(
        authedPost(apiUrl, cookie, `/api/categories/${foreignId}/unarchive`),
        404,
        'Category not found.',
      )

      // Owner-only surface, probed as the owner so the guard isn't what says no.
      yield* probe(
        authedDelete(apiUrl, cookie, `/api/members/${foreignId}`),
        404,
        'Member not found.',
      )
      yield* probe(
        authedDelete(apiUrl, cookie, `/api/invites/${foreignId}`),
        404,
        'Invite not found.',
      )

      // --- ids in bodies: cross-entity references verified per write path ---
      yield* probe(
        authedPost(apiUrl, cookie, '/api/transactions', {
          accountId: foreignId,
          date: '2026-03-08',
          amount: -100,
          description: 'Foreign account',
        }),
        400,
        'Unknown account.',
      )
      yield* probe(
        authedPost(apiUrl, cookie, '/api/transactions', {
          accountId: checking.id,
          date: '2026-03-08',
          amount: -100,
          description: 'Foreign category',
          categoryId: foreignId,
        }),
        400,
        'Unknown category.',
      )
      yield* probe(
        authedPatch(apiUrl, cookie, `/api/transactions/${transaction.id}`, {
          accountId: foreignId,
        }),
        400,
        'Unknown account.',
      )
      yield* probe(
        authedPatch(apiUrl, cookie, `/api/transactions/${transaction.id}`, {
          categoryId: foreignId,
        }),
        400,
        'Unknown category.',
      )

      yield* probe(
        authedPost(apiUrl, cookie, '/api/transfers', {
          fromAccountId: foreignId,
          toAccountId: savings.id,
          amount: 500,
          date: '2026-03-08',
        }),
        400,
        'Unknown account.',
      )
      yield* probe(
        authedPost(apiUrl, cookie, '/api/transfers', {
          fromAccountId: checking.id,
          toAccountId: foreignId,
          amount: 500,
          date: '2026-03-08',
        }),
        400,
        'Unknown account.',
      )
      yield* probe(
        authedPatch(apiUrl, cookie, `/api/transfers/${transfer.id}`, { fromAccountId: foreignId }),
        400,
        'Unknown account.',
      )
      yield* probe(
        authedPatch(apiUrl, cookie, `/api/transfers/${transfer.id}`, { toAccountId: foreignId }),
        400,
        'Unknown account.',
      )

      yield* probe(
        authedPost(apiUrl, cookie, '/api/imports', {
          accountId: foreignId,
          fileName: 'foreign.csv',
          csv: 'date,description,amount\n2026-03-08,Row,-100\n',
        }),
        400,
        'Unknown account.',
      )

      // --- ids in list filters: a foreign id narrows to nothing, never widens ---
      for (const query of [`accountId=${foreignId}`, `categoryId=${foreignId}`]) {
        const filtered = yield* Test.executeWhenReady(
          authedGet(apiUrl, cookie, `/api/transactions?${query}`),
        )
        expect(filtered.status).toBe(200)
        const body = (yield* filtered.json) as unknown as { transactions: unknown[] }
        expect(body.transactions).toEqual([])
      }

      // --- and no probe moved anything the Household owns ---
      const accounts = yield* readAccounts(yield* listAccounts(apiUrl, cookie))
      expect(accounts.map((row) => [row.name, row.archivedAt])).toEqual([
        ['Checking', null],
        ['Savings', null],
      ])
      const ledger = yield* Test.executeWhenReady(authedGet(apiUrl, cookie, '/api/transactions'))
      const { transactions } = (yield* ledger.json) as unknown as {
        transactions: Array<{ description: string; categoryId: string | null }>
      }
      // The Market expense plus the Transfer's two legs, all as written.
      expect(transactions).toHaveLength(3)
      expect(transactions.map((row) => row.description).sort()).toEqual([
        'Market',
        'Transfer',
        'Transfer',
      ])
      const imports = yield* Test.executeWhenReady(authedGet(apiUrl, cookie, '/api/imports'))
      const importList = (yield* imports.json) as unknown as {
        imports: Array<{ status: string }>
      }
      expect(importList.imports.map((row) => row.status)).toEqual(['pending'])
      const invites = yield* Test.executeWhenReady(authedGet(apiUrl, cookie, '/api/invites'))
      const inviteList = (yield* invites.json) as unknown as { invites: Array<{ id: string }> }
      expect(inviteList.invites).toHaveLength(1)
    }),
  { timeout: 600_000 },
)
