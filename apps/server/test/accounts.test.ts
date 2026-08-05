import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import type { HttpClientResponse } from 'effect/unstable/http/HttpClientResponse'
import { expect } from 'vite-plus/test'
import {
  cookieHeader,
  freshApiUrl,
  signUpOwner,
  signUpRequest,
  test,
  trustedOrigin,
  withCookie,
} from './harness.ts'

// --- Accounts with derived Balances (issue #7, ADR 0001) ---
// Every test mints Users, so each deploys a pristine instance through the
// scratch stack (see harness.ts). The seam is HTTP: the same /api/accounts
// surface the web app consumes.

interface AccountView {
  id: string
  name: string
  type: string
  kind: string
  openingBalance: number
  balance: number
  archivedAt: string | null
  createdAt: string
}

const readAccount = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => (body as unknown as { account: AccountView }).account)

const readAccounts = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => (body as unknown as { accounts: AccountView[] }).accounts)

const createAccount = (apiUrl: string, cookie: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(
    HttpClientRequest.post(`${apiUrl}/api/accounts`).pipe(
      trustedOrigin,
      withCookie(cookie),
      HttpClientRequest.bodyJsonUnsafe(body),
    ),
  )

// Plain execute, no cold-start retry: executeWhenReady treats 404 as "edge
// not converged yet" and retries it away, so a test that ASSERTS a 404 must
// hit the (by then long warm) worker directly.
const executeWarm = (request: HttpClientRequest.HttpClientRequest) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    return yield* client.execute(request)
  })

const patchRequest = (apiUrl: string, cookie: string, id: string, body: Record<string, unknown>) =>
  HttpClientRequest.patch(`${apiUrl}/api/accounts/${id}`).pipe(
    trustedOrigin,
    withCookie(cookie),
    HttpClientRequest.bodyJsonUnsafe(body),
  )

const patchAccount = (apiUrl: string, cookie: string, id: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(patchRequest(apiUrl, cookie, id, body))

const archiveRequest = (apiUrl: string, cookie: string, id: string, action: string) =>
  HttpClientRequest.post(`${apiUrl}/api/accounts/${id}/${action}`).pipe(
    trustedOrigin,
    withCookie(cookie),
  )

const archiveAccount = (apiUrl: string, cookie: string, id: string, action: string) =>
  Test.executeWhenReady(archiveRequest(apiUrl, cookie, id, action))

const listAccounts = (apiUrl: string, cookie: string, query = '') =>
  Test.executeWhenReady(
    HttpClientRequest.get(`${apiUrl}/api/accounts${query}`).pipe(withCookie(cookie)),
  )

test.provider(
  'Accounts: create, edit, archive; Balance is derived and never editable',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)

      // Accounts are Household data: no session, no access.
      const anonymous = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/accounts`),
      )
      expect(anonymous.status).toBe(401)

      const owner = yield* signUpOwner(apiUrl, 'accounts-owner@example.com', {
        householdName: 'Ledger House',
        currency: 'BRL',
      })

      // A fresh Household has no Accounts.
      const empty = yield* listAccounts(apiUrl, owner.cookie)
      expect(empty.status).toBe(200)
      expect(yield* readAccounts(empty)).toEqual([])

      // Create: Balance comes back derived — with no Transactions it equals
      // the opening balance (ADR 0001). A smuggled `balance` field is ignored,
      // never stored.
      const created = yield* createAccount(apiUrl, owner.cookie, {
        name: 'Nubank',
        type: 'checking',
        openingBalance: 123456,
        balance: 999999,
      })
      expect(created.status).toBe(200)
      const checking = yield* readAccount(created)
      expect(checking.name).toBe('Nubank')
      expect(checking.type).toBe('checking')
      expect(checking.kind).toBe('asset')
      expect(checking.openingBalance).toBe(123456)
      expect(checking.balance).toBe(123456)
      expect(checking.archivedAt).toBeNull()

      // The type enum distinguishes asset and liability kinds; a credit card
      // can open in debt (negative opening balance).
      const card = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Visa',
          type: 'credit_card',
          openingBalance: -50000,
        }),
      )
      expect(card.kind).toBe('liability')
      expect(card.balance).toBe(-50000)

      const both = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(both.map((entry) => entry.name)).toEqual(['Nubank', 'Visa'])

      // Edit: name, type, and opening balance are the editable state; the
      // derived Balance follows the opening balance.
      const patched = yield* patchAccount(apiUrl, owner.cookie, checking.id, {
        name: 'Nubank Checking',
        openingBalance: 200000,
      })
      expect(patched.status).toBe(200)
      const renamed = yield* readAccount(patched)
      expect(renamed.name).toBe('Nubank Checking')
      expect(renamed.openingBalance).toBe(200000)
      expect(renamed.balance).toBe(200000)

      // Balance is not editable state: a PATCH that only carries `balance`
      // has nothing to update and is rejected.
      const balancePatch = yield* patchAccount(apiUrl, owner.cookie, checking.id, {
        balance: 1,
      })
      expect(balancePatch.status).toBe(400)

      // Archive: hidden from the default list, history kept.
      const archived = yield* archiveAccount(apiUrl, owner.cookie, card.id, 'archive')
      expect(archived.status).toBe(200)
      expect((yield* readAccount(archived)).archivedAt).not.toBeNull()

      const defaultList = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(defaultList.map((entry) => entry.name)).toEqual(['Nubank Checking'])

      const fullList = yield* readAccounts(
        yield* listAccounts(apiUrl, owner.cookie, '?includeArchived=true'),
      )
      expect(fullList.map((entry) => [entry.name, entry.archivedAt !== null])).toEqual([
        ['Nubank Checking', false],
        ['Visa', true],
      ])

      // Unarchive brings a closed Account back into the default list.
      const restored = yield* archiveAccount(apiUrl, owner.cookie, card.id, 'unarchive')
      expect(restored.status).toBe(200)
      expect((yield* readAccount(restored)).archivedAt).toBeNull()
      const restoredList = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(restoredList.map((entry) => entry.name)).toEqual(['Nubank Checking', 'Visa'])

      // Unknown Accounts 404 on every mutation.
      expect(
        (yield* executeWarm(patchRequest(apiUrl, owner.cookie, 'missing', { name: 'X' }))).status,
      ).toBe(404)
      expect(
        (yield* executeWarm(archiveRequest(apiUrl, owner.cookie, 'missing', 'archive'))).status,
      ).toBe(404)
    }),
  { timeout: 600_000 },
)

test.provider(
  'Accounts: any Member manages them; invalid input is rejected',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const owner = yield* signUpOwner(apiUrl, 'ledger-owner@example.com')

      // Bring in a plain Member via an Invite (accounts are member-level,
      // unlike the owner-only management surface of issue #6).
      const invited = yield* Test.executeWhenReady(
        HttpClientRequest.post(`${apiUrl}/api/invites`).pipe(
          trustedOrigin,
          withCookie(owner.cookie),
          HttpClientRequest.bodyJsonUnsafe({}),
        ),
      )
      expect(invited.status).toBe(200)
      const { invite } = (yield* invited.json) as unknown as { invite: { token: string } }
      const joined = yield* Test.executeWhenReady(
        signUpRequest(apiUrl, 'ledger-member@example.com', 'Ledger Member', {
          currency: null,
          inviteToken: invite.token,
        }),
      )
      expect(joined.status).toBe(200)
      const memberCookie = cookieHeader(joined)

      // The Member creates and archives an Account in the shared ledger…
      const created = yield* createAccount(apiUrl, memberCookie, {
        name: 'Cash Jar',
        type: 'cash',
        openingBalance: 0,
      })
      expect(created.status).toBe(200)
      const jar = yield* readAccount(created)
      expect(jar.balance).toBe(0)
      expect((yield* archiveAccount(apiUrl, memberCookie, jar.id, 'archive')).status).toBe(200)

      // …and the owner sees the same Account, archived, in the same Household.
      const ownerView = yield* readAccounts(
        yield* listAccounts(apiUrl, owner.cookie, '?includeArchived=true'),
      )
      expect(ownerView.map((entry) => [entry.name, entry.archivedAt !== null])).toEqual([
        ['Cash Jar', true],
      ])

      // Validation: a missing or blank name, an unknown type, and a
      // non-integer opening balance (minor units are INTEGERs, ADR 0006)
      // are all rejected.
      const invalid: Record<string, unknown>[] = [
        { type: 'checking', openingBalance: 0 },
        { name: '   ', type: 'checking', openingBalance: 0 },
        { name: 'Crypto', type: 'crypto', openingBalance: 0 },
        { name: 'Float', type: 'checking', openingBalance: 10.5 },
        { name: 'Missing', type: 'checking' },
        { name: 'Stringly', type: 'checking', openingBalance: '100' },
      ]
      for (const body of invalid) {
        expect((yield* createAccount(apiUrl, owner.cookie, body)).status).toBe(400)
      }

      // PATCH applies the same field validation.
      const account = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Savings',
          type: 'savings',
          openingBalance: 1000,
        }),
      )
      expect(
        (yield* patchAccount(apiUrl, owner.cookie, account.id, { type: 'crypto' })).status,
      ).toBe(400)
      expect(
        (yield* patchAccount(apiUrl, owner.cookie, account.id, { openingBalance: 1.5 })).status,
      ).toBe(400)
      expect((yield* patchAccount(apiUrl, owner.cookie, account.id, { name: '' })).status).toBe(400)
    }),
  { timeout: 600_000 },
)
