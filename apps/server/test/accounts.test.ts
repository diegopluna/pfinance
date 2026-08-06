import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import { expect } from 'vite-plus/test'
import {
  cookieHeader,
  createAccount,
  createTransaction,
  executeWarm,
  freshApiUrl,
  listAccounts,
  readAccount,
  readAccounts,
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

const patchRequest = (apiUrl: string, cookie: string, id: string, body: Record<string, unknown>) =>
  HttpClientRequest.patch(`${apiUrl}/api/accounts/${id}`).pipe(
    trustedOrigin,
    withCookie(cookie),
    HttpClientRequest.bodyJsonUnsafe(body),
  )

const patchAccount = (apiUrl: string, cookie: string, id: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(patchRequest(apiUrl, cookie, id, body))

type ArchiveAction = 'archive' | 'unarchive'

const archiveRequest = (apiUrl: string, cookie: string, id: string, action: ArchiveAction) =>
  HttpClientRequest.post(`${apiUrl}/api/accounts/${id}/${action}`).pipe(
    trustedOrigin,
    withCookie(cookie),
  )

const archiveAccount = (apiUrl: string, cookie: string, id: string, action: ArchiveAction) =>
  Test.executeWhenReady(archiveRequest(apiUrl, cookie, id, action))

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
      const archivedCard = yield* readAccount(archived)
      expect(archivedCard.archivedAt).not.toBeNull()

      // Re-archiving is an idempotent no-op: the original archivedAt is when
      // the account closed, and a second click must not rewrite it. The sleep
      // outlasts the second-precision timestamps, so a rewrite can't hide
      // behind two calls landing in the same second.
      yield* Effect.sleep('1.5 seconds')
      const rearchived = yield* archiveAccount(apiUrl, owner.cookie, card.id, 'archive')
      expect(rearchived.status).toBe(200)
      expect((yield* readAccount(rearchived)).archivedAt).toEqual(archivedCard.archivedAt)

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

// The dashboard (issue #16) reads the default /api/accounts list: every
// active Account with its derived Balance, archived ones excluded. This test
// pins that read against a known ledger — opening balances plus signed
// Transactions, balance adjustments included, liabilities negative.
test.provider(
  'Dashboard read: the default list derives every active Balance from a known ledger',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const owner = yield* signUpOwner(apiUrl, 'dashboard-owner@example.com', {
        householdName: 'Ledger House',
        currency: 'BRL',
      })

      const checking = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Checking',
          type: 'checking',
          openingBalance: 100000,
        }),
      )
      const visa = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Visa',
          type: 'credit_card',
          openingBalance: -50000,
        }),
      )
      const savings = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Old Savings',
          type: 'savings',
          openingBalance: 25000,
        }),
      )

      // The known ledger: 100000 + 150000 − 2500 − 500 = 247000 on Checking
      // (the adjustment moves the Balance like any Transaction, ADR 0001),
      // −50000 − 30000 = −80000 on the Visa, 25000 + 1000 = 26000 on Savings.
      const ledger: Record<string, unknown>[] = [
        { accountId: checking.id, date: '2026-01-01', amount: 150000, description: 'Salary' },
        { accountId: checking.id, date: '2026-01-15', amount: -2500, description: 'Groceries' },
        {
          accountId: checking.id,
          date: '2026-01-20',
          amount: -500,
          description: 'Fee drift',
          kind: 'balance_adjustment',
        },
        { accountId: visa.id, date: '2026-01-10', amount: -30000, description: 'Flights' },
        { accountId: savings.id, date: '2026-01-05', amount: 1000, description: 'Interest' },
      ]
      for (const entry of ledger) {
        expect((yield* createTransaction(apiUrl, owner.cookie, entry)).status).toBe(200)
      }

      expect((yield* archiveAccount(apiUrl, owner.cookie, savings.id, 'archive')).status).toBe(200)

      // The dashboard's exact read: active Accounts only, Balances derived,
      // the liability's negative. The archived Account is absent entirely —
      // its Balance can't leak into the view.
      const dashboard = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(dashboard.map((entry) => [entry.name, entry.kind, entry.balance])).toEqual([
        ['Checking', 'asset', 247000],
        ['Visa', 'liability', -80000],
      ])

      // History is preserved, not lost: the archived Account still derives
      // its Balance when explicitly asked for.
      const full = yield* readAccounts(
        yield* listAccounts(apiUrl, owner.cookie, '?includeArchived=true'),
      )
      // Name breaks the creation-timestamp tie (second precision), so the
      // full list is alphabetical here.
      expect(full.map((entry) => [entry.name, entry.balance, entry.archivedAt !== null])).toEqual([
        ['Checking', 247000, false],
        ['Old Savings', 26000, true],
        ['Visa', -80000, false],
      ])
    }),
  { timeout: 600_000 },
)
