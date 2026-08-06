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
  kind: string
  categoryId: string | null
  transferId: string | null
  counterpartAccountId: string | null
  enteredBy: string | null
  createdAt: string
}

interface TransferView {
  id: string
  fromAccountId: string
  toAccountId: string
  amount: number
  date: string
  description: string
  createdAt: string
}

interface CategoryView {
  id: string
  name: string
  archivedAt: string | null
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

const readTransfer = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => (body as unknown as { transfer: TransferView }).transfer)

const createTransfer = (apiUrl: string, cookie: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(
    HttpClientRequest.post(`${apiUrl}/api/transfers`).pipe(
      trustedOrigin,
      withCookie(cookie),
      HttpClientRequest.bodyJsonUnsafe(body),
    ),
  )

const patchTransferRequest = (
  apiUrl: string,
  cookie: string,
  id: string,
  body: Record<string, unknown>,
) =>
  HttpClientRequest.patch(`${apiUrl}/api/transfers/${id}`).pipe(
    trustedOrigin,
    withCookie(cookie),
    HttpClientRequest.bodyJsonUnsafe(body),
  )

const patchTransfer = (apiUrl: string, cookie: string, id: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(patchTransferRequest(apiUrl, cookie, id, body))

const deleteTransferRequest = (apiUrl: string, cookie: string, id: string) =>
  HttpClientRequest.delete(`${apiUrl}/api/transfers/${id}`).pipe(trustedOrigin, withCookie(cookie))

const deleteTransfer = (apiUrl: string, cookie: string, id: string) =>
  Test.executeWhenReady(deleteTransferRequest(apiUrl, cookie, id))

const readCategory = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => (body as unknown as { category: CategoryView }).category)

const readCategories = (response: HttpClientResponse) =>
  Effect.map(
    response.json,
    (body) => (body as unknown as { categories: CategoryView[] }).categories,
  )

const listCategories = (apiUrl: string, cookie: string) =>
  Test.executeWhenReady(HttpClientRequest.get(`${apiUrl}/api/categories`).pipe(withCookie(cookie)))

const createCategory = (apiUrl: string, cookie: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(
    HttpClientRequest.post(`${apiUrl}/api/categories`).pipe(
      trustedOrigin,
      withCookie(cookie),
      HttpClientRequest.bodyJsonUnsafe(body),
    ),
  )

const archiveCategory = (apiUrl: string, cookie: string, id: string) =>
  Test.executeWhenReady(
    HttpClientRequest.post(`${apiUrl}/api/categories/${id}/archive`).pipe(
      trustedOrigin,
      withCookie(cookie),
    ),
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
      // No Category sent means Uncategorized (ADR 0003) — null, not a
      // sentinel row.
      expect(groceries.categoryId).toBeNull()

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
  'Balance Adjustments: move the Balance but are excluded from Expense/Income (issue #9)',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const owner = yield* signUpOwner(apiUrl, 'adjust-owner@example.com')

      const checking = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Checking',
          type: 'checking',
          openingBalance: 10000,
        }),
      )
      const card = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Visa',
          type: 'credit_card',
          openingBalance: 0,
        }),
      )

      // Ordinary entries are the standard kind — stated or defaulted.
      const groceries = yield* readTransaction(
        yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-03-01',
          amount: -2000,
          description: 'Groceries',
        }),
      )
      expect(groceries.kind).toBe('standard')
      const salary = yield* readTransaction(
        yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-03-02',
          amount: 50000,
          description: 'Salary',
          kind: 'standard',
        }),
      )
      expect(salary.kind).toBe('standard')
      expect(
        (yield* createTransaction(apiUrl, owner.cookie, {
          accountId: card.id,
          date: '2026-03-02',
          amount: -4500,
          description: 'Streaming',
        })).status,
      ).toBe(200)

      // Record Balance Adjustments in both directions: the flavor whose only
      // purpose is correcting drift between the derived Balance and reality.
      const created = yield* createTransaction(apiUrl, owner.cookie, {
        accountId: checking.id,
        date: '2026-03-03',
        amount: 12345,
        description: 'Untracked interest',
        kind: 'balance_adjustment',
      })
      expect(created.status).toBe(200)
      const interest = yield* readTransaction(created)
      expect(interest.kind).toBe('balance_adjustment')
      const writeOff = yield* readTransaction(
        yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-03-04',
          amount: -345,
          description: 'Bank fee drift',
          kind: 'balance_adjustment',
        }),
      )
      expect(writeOff.kind).toBe('balance_adjustment')

      // The Balance INCLUDES the adjustments (ADR 0001):
      // 10000 - 2000 + 50000 + 12345 - 345 = 70000.
      expect(
        balanceOf(yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie)), checking.id),
      ).toBe(70000)

      // The plain ledger lists every kind; each row names its kind so the
      // client can label adjustments.
      const all = yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie))
      expect(Object.fromEntries(all.map((entry) => [entry.description, entry.kind]))).toEqual({
        Groceries: 'standard',
        Salary: 'standard',
        Streaming: 'standard',
        'Untracked interest': 'balance_adjustment',
        'Bank fee drift': 'balance_adjustment',
      })

      // Expense and Income are sign-derived views that EXCLUDE adjustments —
      // in both directions, so drift corrections never read as spending or
      // earning.
      const expenses = yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie, '?view=expense'),
      )
      expect(expenses.map((entry) => entry.description).sort()).toEqual(['Groceries', 'Streaming'])
      const income = yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie, '?view=income'),
      )
      expect(income.map((entry) => entry.description)).toEqual(['Salary'])

      // The view composes with the other filters.
      const checkingExpenses = yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie, `?view=expense&accountId=${checking.id}`),
      )
      expect(checkingExpenses.map((entry) => entry.description)).toEqual(['Groceries'])

      // A zero amount is neither an Expense nor Income — the sign rule.
      expect(
        (yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-03-05',
          amount: 0,
          description: 'Zero correction',
        })).status,
      ).toBe(200)
      expect(
        (yield* readTransactions(
          yield* listTransactions(apiUrl, owner.cookie, '?view=expense'),
        )).map((entry) => entry.description),
      ).not.toContain('Zero correction')
      expect(
        (yield* readTransactions(
          yield* listTransactions(apiUrl, owner.cookie, '?view=income'),
        )).map((entry) => entry.description),
      ).not.toContain('Zero correction')

      // Re-labeling: PATCH flips a mislabeled entry's kind; the Balance is
      // untouched (the amount didn't move) but the views follow.
      const relabeled = yield* readTransaction(
        yield* patchTransaction(apiUrl, owner.cookie, salary.id, { kind: 'balance_adjustment' }),
      )
      expect(relabeled.kind).toBe('balance_adjustment')
      expect(
        yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie, '?view=income')),
      ).toEqual([])
      expect(
        balanceOf(yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie)), checking.id),
      ).toBe(70000)

      // Unknown kinds and views are rejected, never silently coerced — and
      // the transfer kind, while known, is never writable here: a lone leg
      // can only exist through /api/transfers (issue #12).
      expect(
        (yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-03-06',
          amount: 1,
          description: 'ok',
          kind: 'transfer',
        })).status,
      ).toBe(400)
      expect(
        (yield* patchTransaction(apiUrl, owner.cookie, groceries.id, { kind: '' })).status,
      ).toBe(400)
      expect((yield* listTransactions(apiUrl, owner.cookie, '?view=spending')).status).toBe(400)
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

      // Categories are seeded at Household creation (issue #10); assignment
      // rides on create (issue #11): exactly one Category or absent =
      // Uncategorized.
      const categories = yield* readCategories(yield* listCategories(apiUrl, owner.cookie))
      const groceriesCategory = categories.find((entry) => entry.name === 'Groceries')
      const diningOut = categories.find((entry) => entry.name === 'Dining Out')
      expect(groceriesCategory).toBeDefined()
      expect(diningOut).toBeDefined()

      const seed: [string, string, string, number, string, string?][] = [
        // cookie, accountId, date, amount, description, categoryId
        [owner.cookie, checking.id, '2026-01-05', -1200, 'Coffee beans'],
        [owner.cookie, checking.id, '2026-01-20', 500000, 'Salary'],
        [memberCookie, checking.id, '2026-02-10', -8000, 'Groceries', groceriesCategory?.id],
        [memberCookie, card.id, '2026-01-20', -4500, 'Streaming subscription'],
        [owner.cookie, card.id, '2026-02-14', -15000, 'Dinner out', diningOut?.id],
      ]
      for (const [cookie, accountId, date, amount, description, categoryId] of seed) {
        expect(
          (yield* createTransaction(apiUrl, cookie, {
            accountId,
            date,
            amount,
            description,
            categoryId,
          })).status,
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

      // The list carries each row's Category — one or null (ADR 0003).
      expect(Object.fromEntries(all.map((entry) => [entry.description, entry.categoryId]))).toEqual(
        {
          'Coffee beans': null,
          Salary: null,
          Groceries: groceriesCategory?.id,
          'Streaming subscription': null,
          'Dinner out': diningOut?.id,
        },
      )

      // Category filter, and Uncategorized as its own filter — null is a
      // state, not a sentinel Category row.
      const groceriesOnly = yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie, `?categoryId=${groceriesCategory?.id}`),
      )
      expect(groceriesOnly.map((entry) => entry.description)).toEqual(['Groceries'])
      const uncategorized = yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie, '?categoryId=uncategorized'),
      )
      expect(uncategorized.map((entry) => entry.description).sort()).toEqual([
        'Coffee beans',
        'Salary',
        'Streaming subscription',
      ])
      const uncategorizedOnCard = yield* readTransactions(
        yield* listTransactions(
          apiUrl,
          owner.cookie,
          `?categoryId=uncategorized&accountId=${card.id}`,
        ),
      )
      expect(uncategorizedOnCard.map((entry) => entry.description)).toEqual([
        'Streaming subscription',
      ])

      // Assignment on edit: set a Category, then clear back to Uncategorized
      // with an explicit null.
      const coffee = all.find((entry) => entry.description === 'Coffee beans')
      expect(coffee).toBeDefined()
      const categorized = yield* patchTransaction(apiUrl, memberCookie, coffee?.id ?? '', {
        categoryId: diningOut?.id,
      })
      expect(categorized.status).toBe(200)
      expect((yield* readTransaction(categorized)).categoryId).toBe(diningOut?.id)
      const clearedResponse = yield* patchTransaction(apiUrl, owner.cookie, coffee?.id ?? '', {
        categoryId: null,
      })
      expect(clearedResponse.status).toBe(200)
      expect((yield* readTransaction(clearedResponse)).categoryId).toBeNull()

      // Only the Household's own Categories are assignable. No second
      // Household can exist in a scratch instance (sign-up locks after the
      // first User, Invites join this Household), so a fabricated foreign id
      // — well-formed, since seeded ids are `${householdId}:${slug}` —
      // exercises the same scoping predicate on create and on edit.
      const foreignCategory = `${crypto.randomUUID()}:groceries`
      expect(
        (yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-03-01',
          amount: -100,
          description: 'Foreign category',
          categoryId: foreignCategory,
        })).status,
      ).toBe(400)
      expect(
        (yield* patchTransaction(apiUrl, owner.cookie, coffee?.id ?? '', {
          categoryId: foreignCategory,
        })).status,
      ).toBe(400)
      // Malformed category ids are rejected, never coerced.
      expect(
        (yield* patchTransaction(apiUrl, owner.cookie, coffee?.id ?? '', { categoryId: 7 })).status,
      ).toBe(400)

      // Archiving retires a Category from assignment (issue #10) while rows
      // that already carry it keep their history and stay editable.
      const retired = yield* readCategory(
        yield* createCategory(apiUrl, owner.cookie, { name: 'Retired' }),
      )
      const retiredTx = yield* readTransaction(
        yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-03-02',
          amount: -200,
          description: 'Old vice',
          categoryId: retired.id,
        }),
      )
      expect(retiredTx.categoryId).toBe(retired.id)
      expect((yield* archiveCategory(apiUrl, owner.cookie, retired.id)).status).toBe(200)
      expect(
        (yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-03-03',
          amount: -300,
          description: 'New vice',
          categoryId: retired.id,
        })).status,
      ).toBe(400)
      const editedRetired = yield* patchTransaction(apiUrl, owner.cookie, retiredTx.id, {
        description: 'Old habit',
      })
      expect(editedRetired.status).toBe(200)
      expect((yield* readTransaction(editedRetired)).categoryId).toBe(retired.id)
      // …including through a client that resubmits the whole field set (the
      // web form does): re-asserting the row's current archived Category is
      // not an assignment…
      const resubmitted = yield* patchTransaction(apiUrl, owner.cookie, retiredTx.id, {
        amount: -250,
        categoryId: retired.id,
      })
      expect(resubmitted.status).toBe(200)
      expect((yield* readTransaction(resubmitted)).categoryId).toBe(retired.id)
      // …but naming it on a row that doesn't carry it is.
      expect(
        (yield* patchTransaction(apiUrl, owner.cookie, coffee?.id ?? '', {
          categoryId: retired.id,
        })).status,
      ).toBe(400)

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

test.provider(
  'Transfers: one entity, two legs — atomic writes, both Balances, excluded from views (issue #12)',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)

      // Transfers are Household data: no session, no access.
      const anonymous = yield* Test.executeWhenReady(
        HttpClientRequest.post(`${apiUrl}/api/transfers`).pipe(
          trustedOrigin,
          HttpClientRequest.bodyJsonUnsafe({}),
        ),
      )
      expect(anonymous.status).toBe(401)

      const owner = yield* signUpOwner(apiUrl, 'transfer-owner@example.com')
      const checking = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Checking',
          type: 'checking',
          openingBalance: 100000,
        }),
      )
      const savings = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Savings',
          type: 'savings',
          openingBalance: 0,
        }),
      )
      const vault = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Vault',
          type: 'savings',
          openingBalance: 5000,
        }),
      )

      // Standard rows in both directions, so the derived views below are
      // non-empty — proving legs are excluded, not that the views are empty.
      const groceries = yield* readTransaction(
        yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-04-01',
          amount: -2000,
          description: 'Groceries',
        }),
      )
      expect(
        (yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-04-02',
          amount: 50000,
          description: 'Salary',
        })).status,
      ).toBe(200)

      // Create: from-Account, to-Account, positive amount, calendar date —
      // one entity, two linked legs.
      const created = yield* createTransfer(apiUrl, owner.cookie, {
        fromAccountId: checking.id,
        toAccountId: savings.id,
        amount: 25000,
        date: '2026-04-03',
        description: 'Monthly savings',
      })
      expect(created.status).toBe(200)
      const moved = yield* readTransfer(created)
      expect(moved.fromAccountId).toBe(checking.id)
      expect(moved.toAccountId).toBe(savings.id)
      expect(moved.amount).toBe(25000)
      expect(moved.date).toBe('2026-04-03')
      expect(moved.description).toBe('Monthly savings')

      // Both legs render as Transfers in the ledger: kind names the flavor,
      // transferId links the pair, and each leg knows its counterpart.
      const all = yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie))
      const legs = all.filter((entry) => entry.transferId === moved.id)
      expect(legs).toHaveLength(2)
      const outflow = legs.find((entry) => entry.amount < 0)
      const inflow = legs.find((entry) => entry.amount > 0)
      expect(outflow?.kind).toBe('transfer')
      expect(outflow?.accountId).toBe(checking.id)
      expect(outflow?.amount).toBe(-25000)
      expect(outflow?.counterpartAccountId).toBe(savings.id)
      expect(inflow?.kind).toBe('transfer')
      expect(inflow?.accountId).toBe(savings.id)
      expect(inflow?.amount).toBe(25000)
      expect(inflow?.counterpartAccountId).toBe(checking.id)
      expect(legs.every((entry) => entry.date === '2026-04-03')).toBe(true)
      expect(legs.every((entry) => entry.description === 'Monthly savings')).toBe(true)
      // A standard row is linked to no Transfer.
      expect(all.find((entry) => entry.id === groceries.id)?.transferId).toBeNull()

      // Both Balances reflect the Transfer (ADR 0001):
      // checking 100000 - 2000 + 50000 - 25000; savings 0 + 25000.
      const afterCreate = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(balanceOf(afterCreate, checking.id)).toBe(123000)
      expect(balanceOf(afterCreate, savings.id)).toBe(25000)

      // Excluded from Expense and Income by definition: paying yourself is
      // never spending or earning.
      expect(
        (yield* readTransactions(
          yield* listTransactions(apiUrl, owner.cookie, '?view=expense'),
        )).map((entry) => entry.description),
      ).toEqual(['Groceries'])
      expect(
        (yield* readTransactions(
          yield* listTransactions(apiUrl, owner.cookie, '?view=income'),
        )).map((entry) => entry.description),
      ).toEqual(['Salary'])

      // Legs are not independently editable: every mutation goes through the
      // Transfer, so the pair can never drift.
      expect(
        (yield* patchTransaction(apiUrl, owner.cookie, outflow?.id ?? '', { amount: -1 })).status,
      ).toBe(400)
      expect(
        (yield* patchTransaction(apiUrl, owner.cookie, inflow?.id ?? '', {
          description: 'sneaky',
        })).status,
      ).toBe(400)
      expect((yield* deleteTransaction(apiUrl, owner.cookie, outflow?.id ?? '')).status).toBe(400)
      // And a lone leg can't be created or converted on /api/transactions.
      expect(
        (yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-04-04',
          amount: -100,
          description: 'Lone leg',
          kind: 'transfer',
        })).status,
      ).toBe(400)
      expect(
        (yield* patchTransaction(apiUrl, owner.cookie, groceries.id, { kind: 'transfer' })).status,
      ).toBe(400)

      // Edit applies to both legs atomically: amount and date stay mirrored.
      const repriced = yield* patchTransfer(apiUrl, owner.cookie, moved.id, {
        amount: 30000,
        date: '2026-04-05',
      })
      expect(repriced.status).toBe(200)
      const repricedView = yield* readTransfer(repriced)
      expect(repricedView.amount).toBe(30000)
      expect(repricedView.date).toBe('2026-04-05')
      const repricedLegs = (yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie),
      )).filter((entry) => entry.transferId === moved.id)
      expect(repricedLegs.map((entry) => entry.amount).sort((a, b) => a - b)).toEqual([
        -30000, 30000,
      ])
      expect(repricedLegs.every((entry) => entry.date === '2026-04-05')).toBe(true)
      const afterReprice = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(balanceOf(afterReprice, checking.id)).toBe(118000)
      expect(balanceOf(afterReprice, savings.id)).toBe(30000)

      // Re-routing the destination moves the inflow leg's Account; the
      // description follows both legs.
      const rerouted = yield* patchTransfer(apiUrl, owner.cookie, moved.id, {
        toAccountId: vault.id,
        description: 'Vault stash',
      })
      expect(rerouted.status).toBe(200)
      const reroutedView = yield* readTransfer(rerouted)
      expect(reroutedView.fromAccountId).toBe(checking.id)
      expect(reroutedView.toAccountId).toBe(vault.id)
      const reroutedLegs = (yield* readTransactions(
        yield* listTransactions(apiUrl, owner.cookie),
      )).filter((entry) => entry.transferId === moved.id)
      expect(reroutedLegs.every((entry) => entry.description === 'Vault stash')).toBe(true)
      const afterReroute = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(balanceOf(afterReroute, checking.id)).toBe(118000)
      expect(balanceOf(afterReroute, savings.id)).toBe(0)
      expect(balanceOf(afterReroute, vault.id)).toBe(35000)

      // Validation: a Transfer needs two distinct Accounts of this Household
      // and a positive integer amount — direction is structural, never a sign.
      const valid = {
        fromAccountId: checking.id,
        toAccountId: savings.id,
        amount: 100,
        date: '2026-04-06',
      }
      const invalid: Record<string, unknown>[] = [
        { ...valid, toAccountId: checking.id },
        { ...valid, amount: 0 },
        { ...valid, amount: -100 },
        { ...valid, amount: 10.5 },
        { ...valid, fromAccountId: 'missing' },
        { ...valid, toAccountId: 'missing' },
        { ...valid, date: '2026-4-6' },
      ]
      for (const body of invalid) {
        expect((yield* createTransfer(apiUrl, owner.cookie, body)).status).toBe(400)
      }
      const { date: _date, ...noDate } = valid
      expect((yield* createTransfer(apiUrl, owner.cookie, noDate)).status).toBe(400)
      // PATCH validates the merged result: collapsing from and to onto the
      // same Account is rejected, as is a body with nothing editable.
      expect(
        (yield* patchTransfer(apiUrl, owner.cookie, moved.id, { fromAccountId: vault.id })).status,
      ).toBe(400)
      expect((yield* patchTransfer(apiUrl, owner.cookie, moved.id, {})).status).toBe(400)
      expect((yield* patchTransfer(apiUrl, owner.cookie, moved.id, { amount: 0 })).status).toBe(400)

      // Unknown Transfers 404 — and a leg id is not a Transfer id.
      expect(
        (yield* executeWarm(patchTransferRequest(apiUrl, owner.cookie, 'missing', { amount: 1 })))
          .status,
      ).toBe(404)
      expect(
        (yield* executeWarm(deleteTransferRequest(apiUrl, owner.cookie, 'missing'))).status,
      ).toBe(404)
      expect(
        (yield* executeWarm(deleteTransferRequest(apiUrl, owner.cookie, outflow?.id ?? ''))).status,
      ).toBe(404)

      // Delete removes both legs atomically; both Balances return.
      expect((yield* deleteTransfer(apiUrl, owner.cookie, moved.id)).status).toBe(200)
      const afterDelete = yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie))
      expect(balanceOf(afterDelete, checking.id)).toBe(148000)
      expect(balanceOf(afterDelete, savings.id)).toBe(0)
      expect(balanceOf(afterDelete, vault.id)).toBe(5000)
      expect(
        (yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie))).filter(
          (entry) => entry.transferId === moved.id,
        ),
      ).toEqual([])

      // Description is optional: an unnamed Transfer still reads as one.
      const unnamed = yield* readTransfer(
        yield* createTransfer(apiUrl, owner.cookie, {
          fromAccountId: checking.id,
          toAccountId: savings.id,
          amount: 1000,
          date: '2026-04-07',
        }),
      )
      expect(unnamed.description).toBe('Transfer')
      expect(
        (yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie)))
          .filter((entry) => entry.transferId === unnamed.id)
          .every((entry) => entry.description === 'Transfer'),
      ).toBe(true)
    }),
  { timeout: 600_000 },
)
