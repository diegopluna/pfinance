import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import type { HttpClientResponse } from 'effect/unstable/http/HttpClientResponse'
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

      // The catch-alls (issue #51): an Account that fits no finer label —
      // a gift-card balance, an IOU — still gets a home on each side of
      // Net Worth.
      const voucher = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Voucher',
          type: 'other_asset',
          openingBalance: 7500,
        }),
      )
      expect(voucher.kind).toBe('asset')
      const iou = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Wedding IOU',
          type: 'other_liability',
          openingBalance: -20000,
        }),
      )
      expect(iou.kind).toBe('liability')

      const both = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(both.map((entry) => entry.name)).toEqual(['Nubank', 'Visa', 'Voucher', 'Wedding IOU'])

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
      expect(defaultList.map((entry) => entry.name)).toEqual([
        'Nubank Checking',
        'Voucher',
        'Wedding IOU',
      ])

      const fullList = yield* readAccounts(
        yield* listAccounts(apiUrl, owner.cookie, '?includeArchived=true'),
      )
      expect(fullList.map((entry) => [entry.name, entry.archivedAt !== null])).toEqual([
        ['Nubank Checking', false],
        ['Visa', true],
        ['Voucher', false],
        ['Wedding IOU', false],
      ])

      // Unarchive brings a closed Account back into the default list.
      const restored = yield* archiveAccount(apiUrl, owner.cookie, card.id, 'unarchive')
      expect(restored.status).toBe(200)
      expect((yield* readAccount(restored)).archivedAt).toBeNull()
      const restoredList = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(restoredList.map((entry) => entry.name)).toEqual([
        'Nubank Checking',
        'Visa',
        'Voucher',
        'Wedding IOU',
      ])

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

// --- Net Worth over time (issue #17) ---

interface NetWorthPoint {
  month: string
  netWorth: number
}

const readSeries = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => (body as unknown as { series: NetWorthPoint[] }).series)

const netWorthSeries = (apiUrl: string, cookie: string, query = '') =>
  Test.executeWhenReady(
    HttpClientRequest.get(`${apiUrl}/api/net-worth${query}`).pipe(withCookie(cookie)),
  )

// The chart's exact read, pinned against a known ledger. Liabilities
// contribute negatively through the ledger's own sign convention: a credit
// card in debt carries a negative Balance (see the dashboard test above), so
// its months pull the series down — no kind-based sign flip anywhere.
test.provider(
  'Net worth series: monthly line from a known ledger, liabilities negative, boundaries exact',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)

      // Household data: no session, no access.
      const anonymous = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/net-worth`),
      )
      expect(anonymous.status).toBe(401)

      const owner = yield* signUpOwner(apiUrl, 'net-worth-owner@example.com', {
        householdName: 'Ledger House',
        currency: 'BRL',
      })

      // No Accounts, no series — the dashboard shows its empty state instead.
      expect(yield* readSeries(yield* netWorthSeries(apiUrl, owner.cookie))).toEqual([])

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

      // Accounts but an empty ledger: a single point at the requested month —
      // the opening balances, the liability's negative one included:
      // 100000 − 50000 + 25000 = 75000.
      expect(
        yield* readSeries(yield* netWorthSeries(apiUrl, owner.cookie, '?through=2026-03')),
      ).toEqual([{ month: '2026-03', netWorth: 75000 }])

      // The known ledger. The 2025-12-01 entry is the boundary case (issue #1
      // story 48): dated the 1st, it must land in December — if it leaked
      // into November, that month would read 222500 below. 2025-11-30 pins
      // the other edge of the same boundary.
      const ledger: Record<string, unknown>[] = [
        { accountId: checking.id, date: '2025-11-30', amount: 150000, description: 'Salary' },
        { accountId: checking.id, date: '2025-12-01', amount: -2500, description: 'Groceries' },
        {
          accountId: checking.id,
          date: '2025-12-20',
          amount: -500,
          description: 'Fee drift',
          // Adjustments move the Balance like any Transaction (ADR 0001), so
          // they move Net Worth too — only Expense/Income views exclude them.
          kind: 'balance_adjustment',
        },
        { accountId: savings.id, date: '2025-12-15', amount: 1000, description: 'Interest' },
        { accountId: visa.id, date: '2026-02-10', amount: -30000, description: 'Flights' },
      ]
      for (const entry of ledger) {
        expect((yield* createTransaction(apiUrl, owner.cookie, entry)).status).toBe(200)
      }

      // A Transfer moves money between the Household's own Accounts: its legs
      // cancel inside the sum, so paying the card must not move Net Worth.
      const transfer = yield* Test.executeWhenReady(
        HttpClientRequest.post(`${apiUrl}/api/transfers`).pipe(
          trustedOrigin,
          withCookie(owner.cookie),
          HttpClientRequest.bodyJsonUnsafe({
            fromAccountId: checking.id,
            toAccountId: visa.id,
            amount: 40000,
            date: '2026-02-14',
            description: 'Card payoff',
          }),
        ),
      )
      expect(transfer.status).toBe(200)

      // Archiving hides an Account from the dashboard cards, but its history
      // stays in the series — Savings' opening 25000 and December interest
      // remain in every number below.
      expect((yield* archiveAccount(apiUrl, owner.cookie, savings.id, 'archive')).status).toBe(200)

      // The exact series: openings 75000, then Nov +150000 → 225000,
      // Dec −2500 −500 +1000 → 223000, Jan flat (a gap month still gets its
      // point), Feb −30000 → 193000, Mar flat through the requested edge.
      expect(
        yield* readSeries(yield* netWorthSeries(apiUrl, owner.cookie, '?through=2026-03')),
      ).toEqual([
        { month: '2025-11', netWorth: 225000 },
        { month: '2025-12', netWorth: 223000 },
        { month: '2026-01', netWorth: 223000 },
        { month: '2026-02', netWorth: 193000 },
        { month: '2026-03', netWorth: 193000 },
      ])

      // A `through` inside the ledger's span never truncates the line: the
      // ledger's own last month wins the right edge.
      expect(
        yield* readSeries(yield* netWorthSeries(apiUrl, owner.cookie, '?through=2025-11')),
      ).toEqual([
        { month: '2025-11', netWorth: 225000 },
        { month: '2025-12', netWorth: 223000 },
        { month: '2026-01', netWorth: 223000 },
        { month: '2026-02', netWorth: 193000 },
      ])

      // Omitting `through` ends the series at the current month — the shape
      // the dashboard reads. The tail is flat: no Transactions since February.
      const defaultSeries = yield* readSeries(yield* netWorthSeries(apiUrl, owner.cookie))
      expect(defaultSeries.at(-1)).toEqual({
        month: new Date().toISOString().slice(0, 7),
        netWorth: 193000,
      })
      expect(defaultSeries.at(0)).toEqual({ month: '2025-11', netWorth: 225000 })

      // Malformed months are rejected, never silently defaulted.
      const malformed = yield* netWorthSeries(apiUrl, owner.cookie, '?through=2026-13')
      expect(malformed.status).toBe(400)

      // The safety valve: a mistyped ancient year must not balloon the
      // response. One stray 1500 entry spans 6315 months; only the most
      // recent 1200 points survive, and the window's values still carry the
      // old amount — the sum accumulates from the ledger's true start.
      const mistyped = yield* createTransaction(apiUrl, owner.cookie, {
        accountId: checking.id,
        date: '1500-01-10',
        amount: 1,
        description: 'Mistyped year',
      })
      expect(mistyped.status).toBe(200)
      const capped = yield* readSeries(
        yield* netWorthSeries(apiUrl, owner.cookie, '?through=2026-03'),
      )
      expect(capped).toHaveLength(1200)
      expect(capped.at(0)).toEqual({ month: '1926-04', netWorth: 75001 })
      expect(capped.at(-1)).toEqual({ month: '2026-03', netWorth: 193001 })
    }),
  { timeout: 600_000 },
)
