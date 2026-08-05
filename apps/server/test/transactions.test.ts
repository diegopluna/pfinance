import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import type { HttpClientResponse } from 'effect/unstable/http/HttpClientResponse'
import { expect } from 'vite-plus/test'
import {
  cookieHeader,
  createAccount,
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
  type AccountView,
} from './harness.ts'

// --- Manual Transactions (issue #8) ---
// The seam is HTTP: the same /api/transactions surface the web app consumes.
// Each test deploys a pristine instance through the scratch stack (see
// harness.ts) because every test mints Users.

interface TransactionView {
  id: string
  accountId: string
  date: string
  amount: number
  description: string
  enteredBy: string | null
  createdAt: string
}

const readTransaction = (response: HttpClientResponse) =>
  Effect.map(
    response.json,
    (body) => (body as unknown as { transaction: TransactionView }).transaction,
  )

const readTransactions = (response: HttpClientResponse) =>
  Effect.map(
    response.json,
    (body) => (body as unknown as { transactions: TransactionView[] }).transactions,
  )

const createTransaction = (apiUrl: string, cookie: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(
    HttpClientRequest.post(`${apiUrl}/api/transactions`).pipe(
      trustedOrigin,
      withCookie(cookie),
      HttpClientRequest.bodyJsonUnsafe(body),
    ),
  )

const patchRequest = (apiUrl: string, cookie: string, id: string, body: Record<string, unknown>) =>
  HttpClientRequest.patch(`${apiUrl}/api/transactions/${id}`).pipe(
    trustedOrigin,
    withCookie(cookie),
    HttpClientRequest.bodyJsonUnsafe(body),
  )

const patchTransaction = (
  apiUrl: string,
  cookie: string,
  id: string,
  body: Record<string, unknown>,
) => Test.executeWhenReady(patchRequest(apiUrl, cookie, id, body))

const deleteRequest = (apiUrl: string, cookie: string, id: string) =>
  HttpClientRequest.delete(`${apiUrl}/api/transactions/${id}`).pipe(
    trustedOrigin,
    withCookie(cookie),
  )

const deleteTransaction = (apiUrl: string, cookie: string, id: string) =>
  Test.executeWhenReady(deleteRequest(apiUrl, cookie, id))

const listTransactions = (apiUrl: string, cookie: string, query = '') =>
  Test.executeWhenReady(
    HttpClientRequest.get(`${apiUrl}/api/transactions${query}`).pipe(withCookie(cookie)),
  )

const balanceOf = (accounts: AccountView[], id: string) =>
  accounts.find((entry) => entry.id === id)?.balance

test.provider(
  'Transactions: create, edit, delete; Balances sum the ledger; dates are calendar dates',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)

      // Transactions are Household data: no session, no access.
      const anonymous = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/transactions`),
      )
      expect(anonymous.status).toBe(401)

      const owner = yield* signUpOwner(apiUrl, 'ledger-owner@example.com', {
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

      // A fresh Household has no Transactions.
      const empty = yield* listTransactions(apiUrl, owner.cookie)
      expect(empty.status).toBe(200)
      expect(yield* readTransactions(empty)).toEqual([])

      // Create: signed amount (negative = money out), calendar date, and the
      // Member who entered it. A smuggled id is ignored, never stored.
      const created = yield* createTransaction(apiUrl, owner.cookie, {
        accountId: checking.id,
        date: '2026-01-15',
        amount: -2500,
        description: 'Groceries at the market',
        id: 'smuggled',
      })
      expect(created.status).toBe(200)
      const groceries = yield* readTransaction(created)
      expect(groceries.id).not.toBe('smuggled')
      expect(groceries.accountId).toBe(checking.id)
      expect(groceries.date).toBe('2026-01-15')
      expect(groceries.amount).toBe(-2500)
      expect(groceries.description).toBe('Groceries at the market')
      expect(groceries.enteredBy).toBe('Owner')

      // The Account Balance genuinely sums the ledger (ADR 0001).
      expect(
        balanceOf(yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie)), checking.id),
      ).toBe(97500)

      const salary = yield* readTransaction(
        yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-01-01',
          amount: 150000,
          description: 'January salary',
        }),
      )
      expect(
        balanceOf(yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie)), checking.id),
      ).toBe(247500)

      // The ledger lists newest calendar date first.
      const listed = yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie))
      expect(listed.map((entry) => entry.description)).toEqual([
        'Groceries at the market',
        'January salary',
      ])

      // Edit: any subset of date, amount, description, and account is
      // editable; the Balance follows the ledger.
      const patched = yield* patchTransaction(apiUrl, owner.cookie, groceries.id, {
        amount: -3500,
        description: 'Groceries and cleaning supplies',
      })
      expect(patched.status).toBe(200)
      const updated = yield* readTransaction(patched)
      expect(updated.amount).toBe(-3500)
      expect(updated.description).toBe('Groceries and cleaning supplies')
      expect(updated.date).toBe('2026-01-15')
      expect(
        balanceOf(yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie)), checking.id),
      ).toBe(246500)

      const redated = yield* readTransaction(
        yield* patchTransaction(apiUrl, owner.cookie, groceries.id, { date: '2026-02-01' }),
      )
      expect(redated.date).toBe('2026-02-01')

      // Moving a Transaction to another Account moves its amount between the
      // two Balances.
      const savings = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Savings',
          type: 'savings',
          openingBalance: 0,
        }),
      )
      const moved = yield* patchTransaction(apiUrl, owner.cookie, salary.id, {
        accountId: savings.id,
      })
      expect(moved.status).toBe(200)
      const afterMove = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(balanceOf(afterMove, checking.id)).toBe(96500)
      expect(balanceOf(afterMove, savings.id)).toBe(150000)

      // Delete removes the row and the Balance follows.
      expect((yield* deleteTransaction(apiUrl, owner.cookie, salary.id)).status).toBe(200)
      const afterDelete = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(balanceOf(afterDelete, savings.id)).toBe(0)
      expect(
        (yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie))).map(
          (entry) => entry.id,
        ),
      ).toEqual([groceries.id])

      // The ledger can drive a Balance negative (issue #8 acceptance).
      const overdrawn = yield* readTransaction(
        yield* createTransaction(apiUrl, owner.cookie, {
          accountId: savings.id,
          date: '2026-02-02',
          amount: -5000,
          description: 'Overdraft fee',
        }),
      )
      expect(overdrawn.amount).toBe(-5000)
      expect(
        balanceOf(yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie)), savings.id),
      ).toBe(-5000)

      // Dates are calendar dates end-to-end: what goes in comes back
      // byte-identical — a leap day can't shift to Feb 28 or Mar 1 through
      // any timezone conversion because there is no timestamp anywhere.
      const leapDay = yield* readTransaction(
        yield* createTransaction(apiUrl, owner.cookie, {
          accountId: savings.id,
          date: '2024-02-29',
          amount: 100,
          description: 'Leap day deposit',
        }),
      )
      expect(leapDay.date).toBe('2024-02-29')
      const roundTripped = yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie, `?accountId=${savings.id}`),
      )
      expect(roundTripped.find((entry) => entry.id === leapDay.id)?.date).toBe('2024-02-29')

      // Validation: malformed or impossible dates, timestamps, non-integer
      // amounts (ADR 0006), blank descriptions, and unknown Accounts are all
      // rejected.
      const valid = {
        accountId: savings.id,
        date: '2026-03-01',
        amount: 1,
        description: 'ok',
      }
      const invalid: Record<string, unknown>[] = [
        { ...valid, date: '2026-3-1' },
        { ...valid, date: '2026-02-30' },
        { ...valid, date: '2026-01-15T00:00:00Z' },
        { ...valid, date: 1737000000 },
        { ...valid, amount: 10.5 },
        { ...valid, amount: '100' },
        { ...valid, description: '   ' },
        { ...valid, accountId: 'missing' },
      ]
      for (const body of invalid) {
        expect((yield* createTransaction(apiUrl, owner.cookie, body)).status).toBe(400)
      }
      const { date: _date, ...noDate } = valid
      expect((yield* createTransaction(apiUrl, owner.cookie, noDate)).status).toBe(400)

      // PATCH applies the same field validation, and rejects a body with
      // nothing editable in it.
      expect(
        (yield* patchTransaction(apiUrl, owner.cookie, groceries.id, { date: 'tomorrow' })).status,
      ).toBe(400)
      expect(
        (yield* patchTransaction(apiUrl, owner.cookie, groceries.id, { amount: 1.5 })).status,
      ).toBe(400)
      expect(
        (yield* patchTransaction(apiUrl, owner.cookie, groceries.id, { accountId: 'missing' }))
          .status,
      ).toBe(400)
      expect(
        (yield* patchTransaction(apiUrl, owner.cookie, groceries.id, { id: 'x' })).status,
      ).toBe(400)

      // Unknown Transactions 404 on every mutation.
      expect(
        (yield* executeWarm(patchRequest(apiUrl, owner.cookie, 'missing', { amount: 1 }))).status,
      ).toBe(404)
      expect((yield* executeWarm(deleteRequest(apiUrl, owner.cookie, 'missing'))).status).toBe(404)
    }),
  { timeout: 600_000 },
)

test.provider(
  'Transactions: filters, search, and member attribution across the shared ledger',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const owner = yield* signUpOwner(apiUrl, 'filter-owner@example.com')

      // Bring in a plain Member via an Invite: the ledger is shared, so both
      // enter Transactions and each row remembers who entered it.
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
        signUpRequest(apiUrl, 'filter-member@example.com', 'Filter Member', {
          currency: null,
          inviteToken: invite.token,
        }),
      )
      expect(joined.status).toBe(200)
      const memberCookie = cookieHeader(joined)

      const checking = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Checking',
          type: 'checking',
          openingBalance: 0,
        }),
      )
      const card = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Visa',
          type: 'credit_card',
          openingBalance: 0,
        }),
      )

      const seed: [string, string, string, number, string][] = [
        // cookie, accountId, date, amount, description
        [owner.cookie, checking.id, '2026-01-05', -1200, 'Coffee beans'],
        [owner.cookie, checking.id, '2026-01-20', 500000, 'Salary'],
        [memberCookie, checking.id, '2026-02-10', -8000, 'Groceries'],
        [memberCookie, card.id, '2026-01-20', -4500, 'Streaming subscription'],
        [owner.cookie, card.id, '2026-02-14', -15000, 'Dinner out'],
      ]
      for (const [cookie, accountId, date, amount, description] of seed) {
        expect(
          (yield* createTransaction(apiUrl, cookie, { accountId, date, amount, description }))
            .status,
        ).toBe(200)
      }

      // Both Members see the whole Household ledger, with attribution.
      const all = yield* readTransactions(yield* listTransactions(apiUrl, memberCookie))
      expect(all).toHaveLength(5)
      expect(Object.fromEntries(all.map((entry) => [entry.description, entry.enteredBy]))).toEqual({
        'Coffee beans': 'Owner',
        Salary: 'Owner',
        Groceries: 'Filter Member',
        'Streaming subscription': 'Filter Member',
        'Dinner out': 'Owner',
      })

      // Account filter.
      const cardOnly = yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie, `?accountId=${card.id}`),
      )
      expect(cardOnly.map((entry) => entry.description).sort()).toEqual([
        'Dinner out',
        'Streaming subscription',
      ])

      // Date-range filter, boundaries inclusive.
      const january = yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie, '?from=2026-01-05&to=2026-01-20'),
      )
      expect(january.map((entry) => entry.description).sort()).toEqual([
        'Coffee beans',
        'Salary',
        'Streaming subscription',
      ])
      const fromOnly = yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie, '?from=2026-02-01'),
      )
      expect(fromOnly.map((entry) => entry.description).sort()).toEqual(['Dinner out', 'Groceries'])

      // Description search: case-insensitive substring.
      const search = yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie, '?q=GROC'),
      )
      expect(search.map((entry) => entry.description)).toEqual(['Groceries'])

      // Filters compose.
      const combined = yield* readTransactions(
        yield* listTransactions(
          apiUrl,
          owner.cookie,
          `?accountId=${card.id}&from=2026-01-01&to=2026-01-31&q=stream`,
        ),
      )
      expect(combined.map((entry) => entry.description)).toEqual(['Streaming subscription'])

      // Malformed filter dates are rejected, not silently ignored.
      expect((yield* listTransactions(apiUrl, owner.cookie, '?from=last-week')).status).toBe(400)
      expect((yield* listTransactions(apiUrl, owner.cookie, '?to=2026-1-2')).status).toBe(400)

      // The ledger is shared: a Member edits and deletes a Transaction the
      // owner entered. Attribution keeps recording who ENTERED it.
      const dinner = all.find((entry) => entry.description === 'Dinner out')
      expect(dinner).toBeDefined()
      const edited = yield* patchTransaction(apiUrl, memberCookie, dinner?.id ?? '', {
        amount: -18000,
      })
      expect(edited.status).toBe(200)
      expect((yield* readTransaction(edited)).enteredBy).toBe('Owner')
      expect((yield* deleteTransaction(apiUrl, memberCookie, dinner?.id ?? '')).status).toBe(200)
      expect(
        yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie, '?q=dinner')),
      ).toEqual([])
    }),
  { timeout: 600_000 },
)
