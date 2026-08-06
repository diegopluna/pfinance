import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import type { HttpClientResponse } from 'effect/unstable/http/HttpClientResponse'
import { expect } from 'vite-plus/test'
import {
  createAccount,
  executeWarm,
  freshApiUrl,
  listAccounts,
  readAccount,
  readAccounts,
  signUpOwner,
  test,
  trustedOrigin,
  withCookie,
  type AccountView,
} from './harness.ts'

// --- CSV Import: map, preview, confirm (issue #13) ---
// The seam is HTTP: the same /api/imports surface the web app consumes.
// Upload stores the file, preview persists the mapping and surfaces every
// row's fate, confirm creates Uncategorized Transactions that remember their
// Import, and the history lists past Imports with their counts.

interface ImportMapping {
  dateColumn: number
  descriptionColumn: number
  amountColumn: number
  dateFormat: string
}

interface ImportView {
  id: string
  accountId: string
  fileName: string
  status: 'pending' | 'confirmed'
  mapping: ImportMapping | null
  rowCount: number
  createdCount: number | null
  malformedCount: number | null
  duplicateCount: number | null
  createdAt: string
  confirmedAt: string | null
}

interface PreviewRow {
  line: number
  raw: { date: string; description: string; amount: string }
  parsed: { date: string; description: string; amount: number } | null
  error: string | null
  duplicate: boolean
}

interface TransactionView {
  id: string
  accountId: string
  date: string
  amount: number
  description: string
  kind: string
  categoryId: string | null
  importId: string | null
  enteredBy: string | null
}

const readImport = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => (body as unknown as { import: ImportView }).import)

const readImports = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => (body as unknown as { imports: ImportView[] }).imports)

const readColumns = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => (body as unknown as { columns: string[] }).columns)

const readPreview = (response: HttpClientResponse) =>
  Effect.map(response.json, (body) => body as unknown as { import: ImportView; rows: PreviewRow[] })

const readTransactions = (response: HttpClientResponse) =>
  Effect.map(
    response.json,
    (body) => (body as unknown as { transactions: TransactionView[] }).transactions,
  )

const createImport = (apiUrl: string, cookie: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(
    HttpClientRequest.post(`${apiUrl}/api/imports`).pipe(
      trustedOrigin,
      withCookie(cookie),
      HttpClientRequest.bodyJsonUnsafe(body),
    ),
  )

const previewRequest = (
  apiUrl: string,
  cookie: string,
  id: string,
  body: Record<string, unknown>,
) =>
  HttpClientRequest.post(`${apiUrl}/api/imports/${id}/preview`).pipe(
    trustedOrigin,
    withCookie(cookie),
    HttpClientRequest.bodyJsonUnsafe(body),
  )

const previewImport = (apiUrl: string, cookie: string, id: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(previewRequest(apiUrl, cookie, id, body))

const confirmRequest = (
  apiUrl: string,
  cookie: string,
  id: string,
  body?: Record<string, unknown>,
) => {
  const request = HttpClientRequest.post(`${apiUrl}/api/imports/${id}/confirm`).pipe(
    trustedOrigin,
    withCookie(cookie),
  )
  return body === undefined ? request : request.pipe(HttpClientRequest.bodyJsonUnsafe(body))
}

const confirmImport = (
  apiUrl: string,
  cookie: string,
  id: string,
  body?: Record<string, unknown>,
) => Test.executeWhenReady(confirmRequest(apiUrl, cookie, id, body))

const listImports = (apiUrl: string, cookie: string) =>
  Test.executeWhenReady(HttpClientRequest.get(`${apiUrl}/api/imports`).pipe(withCookie(cookie)))

const listTransactions = (apiUrl: string, cookie: string, query = '') =>
  Test.executeWhenReady(
    HttpClientRequest.get(`${apiUrl}/api/transactions${query}`).pipe(withCookie(cookie)),
  )

const balanceOf = (accounts: AccountView[], id: string) =>
  accounts.find((entry) => entry.id === id)?.balance

// A realistic bank export: quoted commas in a description and an amount,
// plus three malformed rows (bad date, empty description, bad amount) that
// must be surfaced and skipped, never silently dropped.
const BANK_CSV = [
  'Date,Description,Amount',
  '2026-01-15,"Coffee, beans",-3.50',
  '2026-01-16,Salary,"1,250.00"',
  'not-a-date,Rent,-800.00',
  '2026-01-17,Refund,12.34',
  '2026-01-18,,-1.00',
  '2026-01-19,Broken amount,12.3.4',
].join('\n')

const MAPPING = { dateColumn: 0, descriptionColumn: 1, amountColumn: 2, dateFormat: 'ymd' }

test.provider(
  'CSV Import: upload → map → preview → confirm creates Uncategorized Transactions; history and Balances follow',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)

      // Imports are Household data: no session, no access.
      const anonymous = yield* Test.executeWhenReady(HttpClientRequest.get(`${apiUrl}/api/imports`))
      expect(anonymous.status).toBe(401)

      const owner = yield* signUpOwner(apiUrl, 'import-owner@example.com', {
        householdName: 'Import House',
        currency: 'USD',
      })
      const checking = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Checking',
          type: 'checking',
          openingBalance: 100000,
        }),
      )

      // A fresh Household has no Imports.
      const empty = yield* listImports(apiUrl, owner.cookie)
      expect(empty.status).toBe(200)
      expect(yield* readImports(empty)).toEqual([])

      // Upload: the Import persists as pending with the file's columns and
      // data-row count; nothing is created yet.
      const uploaded = yield* createImport(apiUrl, owner.cookie, {
        accountId: checking.id,
        fileName: 'bank.csv',
        csv: BANK_CSV,
      })
      expect(uploaded.status).toBe(200)
      expect(yield* readColumns(uploaded)).toEqual(['Date', 'Description', 'Amount'])
      const batch = yield* readImport(uploaded)
      expect(batch.accountId).toBe(checking.id)
      expect(batch.fileName).toBe('bank.csv')
      expect(batch.status).toBe('pending')
      expect(batch.mapping).toBeNull()
      expect(batch.rowCount).toBe(6)
      expect(batch.confirmedAt).toBeNull()
      expect(yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie))).toEqual([])

      // Map + preview: every data row's fate, in file order. Malformed rows
      // are surfaced with their line and the offending cell.
      const previewed = yield* previewImport(apiUrl, owner.cookie, batch.id, MAPPING)
      expect(previewed.status).toBe(200)
      const preview = yield* readPreview(previewed)
      expect(preview.import.mapping).toEqual(MAPPING)
      expect(preview.rows).toHaveLength(6)
      expect(preview.rows[0]).toEqual({
        line: 2,
        raw: { date: '2026-01-15', description: 'Coffee, beans', amount: '-3.50' },
        parsed: { date: '2026-01-15', description: 'Coffee, beans', amount: -350 },
        error: null,
        duplicate: false,
      })
      expect(preview.rows[1]?.parsed).toEqual({
        date: '2026-01-16',
        description: 'Salary',
        amount: 125000,
      })
      expect(preview.rows[2]?.parsed).toBeNull()
      expect(preview.rows[2]?.line).toBe(4)
      expect(preview.rows[2]?.error).toContain('"not-a-date"')
      expect(preview.rows[3]?.parsed?.amount).toBe(1234)
      expect(preview.rows[4]?.error).toMatch(/description/i)
      expect(preview.rows[5]?.error).toContain('"12.3.4"')

      // The mapping persists on the Import (visible in the history) so
      // confirm creates exactly what was previewed.
      const pendingHistory = yield* readImports(yield* listImports(apiUrl, owner.cookie))
      expect(pendingHistory).toHaveLength(1)
      expect(pendingHistory[0]?.status).toBe('pending')
      expect(pendingHistory[0]?.mapping).toEqual(MAPPING)

      // Confirm: the three valid rows become Transactions, the three
      // malformed ones are counted as skipped.
      const confirmed = yield* confirmImport(apiUrl, owner.cookie, batch.id)
      expect(confirmed.status).toBe(200)
      const done = yield* readImport(confirmed)
      expect(done.status).toBe('confirmed')
      expect(done.createdCount).toBe(3)
      expect(done.malformedCount).toBe(3)
      expect(done.confirmedAt).not.toBeNull()

      // All Uncategorized, all standard, and each remembers its Import.
      const created = yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie))
      expect(created).toHaveLength(3)
      expect(created.every((entry) => entry.categoryId === null)).toBe(true)
      expect(created.every((entry) => entry.kind === 'standard')).toBe(true)
      expect(created.every((entry) => entry.importId === batch.id)).toBe(true)
      expect(created.every((entry) => entry.accountId === checking.id)).toBe(true)
      expect(created.every((entry) => entry.enteredBy === 'Owner')).toBe(true)
      expect(Object.fromEntries(created.map((entry) => [entry.description, entry.amount]))).toEqual(
        {
          'Coffee, beans': -350,
          Salary: 125000,
          Refund: 1234,
        },
      )

      // The Balance sums the imported ledger (ADR 0001):
      // 100000 - 350 + 125000 + 1234.
      expect(
        balanceOf(yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie)), checking.id),
      ).toBe(225884)

      // A confirmed Import is frozen: no re-map, no double confirm — the
      // ledger can't receive the same batch twice.
      expect((yield* previewImport(apiUrl, owner.cookie, batch.id, MAPPING)).status).toBe(400)
      expect((yield* confirmImport(apiUrl, owner.cookie, batch.id)).status).toBe(400)
      expect(yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie))).toHaveLength(3)

      // --- A European-style file exercises re-mapping: DD/MM/YYYY dates and
      // decimal-comma amounts on a second Account.
      const savings = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Savings',
          type: 'savings',
          openingBalance: 0,
        }),
      )
      const euro = yield* readImport(
        yield* createImport(apiUrl, owner.cookie, {
          accountId: savings.id,
          fileName: 'poupanca.csv',
          csv: 'Valor,Data,Histórico\n"1.234,56",15/01/2026,Depósito\n"(12,00)",16/01/2026,Tarifa\n',
        }),
      )

      // Confirming before any mapping is chosen is rejected.
      expect((yield* confirmImport(apiUrl, owner.cookie, euro.id)).status).toBe(400)

      // A wrong first mapping shows every row failing — the preview is how a
      // Member sees their mistake before anything is created…
      const wrongMapping = {
        dateColumn: 1,
        descriptionColumn: 2,
        amountColumn: 0,
        dateFormat: 'ymd',
      }
      const wrong = yield* readPreview(
        yield* previewImport(apiUrl, owner.cookie, euro.id, wrongMapping),
      )
      expect(wrong.rows.every((row) => row.parsed === null)).toBe(true)
      // …and confirming a mapping under which nothing parses is rejected.
      expect((yield* confirmImport(apiUrl, owner.cookie, euro.id)).status).toBe(400)

      // Re-map with the right date shape: the stored mapping is replaced.
      const remapped = yield* readPreview(
        yield* previewImport(apiUrl, owner.cookie, euro.id, { ...wrongMapping, dateFormat: 'dmy' }),
      )
      expect(remapped.rows).toEqual([
        {
          line: 2,
          raw: { date: '15/01/2026', description: 'Depósito', amount: '1.234,56' },
          parsed: { date: '2026-01-15', description: 'Depósito', amount: 123456 },
          error: null,
          duplicate: false,
        },
        {
          line: 3,
          raw: { date: '16/01/2026', description: 'Tarifa', amount: '(12,00)' },
          parsed: { date: '2026-01-16', description: 'Tarifa', amount: -1200 },
          error: null,
          duplicate: false,
        },
      ])
      const euroDone = yield* readImport(yield* confirmImport(apiUrl, owner.cookie, euro.id))
      expect(euroDone.createdCount).toBe(2)
      expect(euroDone.malformedCount).toBe(0)
      expect(
        balanceOf(yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie)), savings.id),
      ).toBe(122256)

      // Import history: every Import with its Account, upload date and row
      // counts. Both uploads land within the same second and the timestamp
      // has second precision, so assert on content, not intra-second order.
      const history = yield* readImports(yield* listImports(apiUrl, owner.cookie))
      expect(history).toHaveLength(2)
      const byFile = Object.fromEntries(history.map((entry) => [entry.fileName, entry]))
      expect(byFile['bank.csv']?.accountId).toBe(checking.id)
      expect(byFile['bank.csv']?.status).toBe('confirmed')
      expect(byFile['bank.csv']?.createdCount).toBe(3)
      expect(byFile['bank.csv']?.malformedCount).toBe(3)
      expect(byFile['poupanca.csv']?.accountId).toBe(savings.id)
      expect(byFile['poupanca.csv']?.status).toBe('confirmed')
      expect(byFile['poupanca.csv']?.createdCount).toBe(2)
      expect(byFile['poupanca.csv']?.malformedCount).toBe(0)
      expect(history.every((entry) => entry.createdAt !== null)).toBe(true)

      // A pending Import can be reloaded mid-flow: the single GET returns
      // its columns again for the map screen.
      const resumed = yield* readImport(
        yield* createImport(apiUrl, owner.cookie, {
          accountId: checking.id,
          fileName: 'later.csv',
          csv: 'Date,Description,Amount\n2026-02-01,Snack,-1.00\n',
        }),
      )
      const fetched = yield* Test.executeWhenReady(
        HttpClientRequest.get(`${apiUrl}/api/imports/${resumed.id}`).pipe(withCookie(owner.cookie)),
      )
      expect(fetched.status).toBe(200)
      expect(yield* readColumns(fetched)).toEqual(['Date', 'Description', 'Amount'])
      expect((yield* readImport(fetched)).status).toBe('pending')

      // Validation: uploads and mappings fail loudly, never half-import.
      const validUpload = {
        accountId: checking.id,
        fileName: 'x.csv',
        csv: 'Date,Description,Amount\n2026-02-01,Ok,-1.00\n',
      }
      const badUploads: Record<string, unknown>[] = [
        { ...validUpload, accountId: 'missing' },
        { ...validUpload, accountId: '' },
        { ...validUpload, fileName: '   ' },
        { ...validUpload, csv: '' },
        { ...validUpload, csv: 42 },
        // Header only — nothing to import.
        { ...validUpload, csv: 'Date,Description,Amount\n' },
      ]
      for (const body of badUploads) {
        expect((yield* createImport(apiUrl, owner.cookie, body)).status).toBe(400)
      }
      const badMappings: Record<string, unknown>[] = [
        {},
        { dateColumn: 0, descriptionColumn: 1 },
        { dateColumn: -1, descriptionColumn: 1, amountColumn: 2 },
        { dateColumn: 0, descriptionColumn: 1, amountColumn: 2, dateFormat: 'iso' },
        // Column 7 doesn't exist in a three-column file.
        { dateColumn: 0, descriptionColumn: 1, amountColumn: 7 },
      ]
      for (const body of badMappings) {
        expect((yield* previewImport(apiUrl, owner.cookie, resumed.id, body)).status).toBe(400)
      }

      // Unknown Imports 404 on every surface.
      expect(
        (yield* executeWarm(previewRequest(apiUrl, owner.cookie, 'missing', MAPPING))).status,
      ).toBe(404)
      expect((yield* executeWarm(confirmRequest(apiUrl, owner.cookie, 'missing'))).status).toBe(404)
    }),
  { timeout: 600_000 },
)

// --- Import dedup (issue #14) ---
// Preview flags rows that exact-match an existing Transaction on account +
// date + amount + description; flagged rows are skipped by default and a
// per-row override (confirm body { overrides: [line] }) imports one anyway —
// overlapping bank exports never double-count the ledger.

const createTransaction = (apiUrl: string, cookie: string, body: Record<string, unknown>) =>
  Test.executeWhenReady(
    HttpClientRequest.post(`${apiUrl}/api/transactions`).pipe(
      trustedOrigin,
      withCookie(cookie),
      HttpClientRequest.bodyJsonUnsafe(body),
    ),
  )

test.provider(
  'Import dedup: overlapping exports are flagged and skipped by default; per-row overrides import anyway',
  (scratch) =>
    Effect.gen(function* () {
      const { apiUrl = '' } = yield* scratch.deploy(freshApiUrl)
      const owner = yield* signUpOwner(apiUrl, 'dedup-owner@example.com', {
        householdName: 'Dedup House',
        currency: 'USD',
      })
      const checking = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Checking',
          type: 'checking',
          openingBalance: 0,
        }),
      )

      // Dedup matches any existing Transaction, not just imported ones: this
      // manually entered row will flag the first export's identical row.
      expect(
        (yield* createTransaction(apiUrl, owner.cookie, {
          accountId: checking.id,
          date: '2026-03-01',
          amount: -1999,
          description: 'Streaming service',
        })).status,
      ).toBe(200)

      const first = yield* readImport(
        yield* createImport(apiUrl, owner.cookie, {
          accountId: checking.id,
          fileName: 'march-a.csv',
          csv: [
            'Date,Description,Amount',
            '2026-03-01,Streaming service,-19.99',
            '2026-03-02,Coffee,-4.00',
            '2026-03-03,Salary,2000.00',
          ].join('\n'),
        }),
      )
      const firstPreview = yield* readPreview(
        yield* previewImport(apiUrl, owner.cookie, first.id, MAPPING),
      )
      expect(firstPreview.rows.map((row) => row.duplicate)).toEqual([true, false, false])

      // Confirm without overrides: flagged rows are skipped, so the manual
      // row is never double-counted.
      const firstDone = yield* readImport(yield* confirmImport(apiUrl, owner.cookie, first.id))
      expect(firstDone.createdCount).toBe(2)
      expect(firstDone.duplicateCount).toBe(1)
      expect(firstDone.malformedCount).toBe(0)
      const afterFirst = yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie))
      expect(afterFirst).toHaveLength(3)
      expect(afterFirst.filter((entry) => entry.description === 'Streaming service')).toHaveLength(
        1,
      )

      // An overlapping second export: two rows repeat the first one, one is
      // new, one is malformed. Malformed rows are never duplicate-flagged —
      // there is nothing parsed to match.
      const second = yield* readImport(
        yield* createImport(apiUrl, owner.cookie, {
          accountId: checking.id,
          fileName: 'march-b.csv',
          csv: [
            'Date,Description,Amount',
            '2026-03-02,Coffee,-4.00',
            '2026-03-03,Salary,2000.00',
            '2026-03-04,Books,-15.00',
            'bad-date,Oops,-1.00',
          ].join('\n'),
        }),
      )
      const secondPreview = yield* readPreview(
        yield* previewImport(apiUrl, owner.cookie, second.id, MAPPING),
      )
      expect(secondPreview.rows.map((row) => row.duplicate)).toEqual([true, true, false, false])
      expect(secondPreview.rows[0]).toEqual({
        line: 2,
        raw: { date: '2026-03-02', description: 'Coffee', amount: '-4.00' },
        parsed: { date: '2026-03-02', description: 'Coffee', amount: -400 },
        error: null,
        duplicate: true,
      })

      // Malformed overrides are rejected loudly before anything is created.
      const badBodies: Record<string, unknown>[] = [
        { overrides: 'all' },
        { overrides: [1.5] },
        { overrides: ['2'] },
        { overrides: [-1] },
      ]
      for (const body of badBodies) {
        expect((yield* confirmImport(apiUrl, owner.cookie, second.id, body)).status).toBe(400)
      }

      // Override line 2 (Coffee): the Member chooses to import it anyway;
      // Salary stays skipped. The confirmed count matches those choices.
      const secondDone = yield* readImport(
        yield* confirmImport(apiUrl, owner.cookie, second.id, { overrides: [2] }),
      )
      expect(secondDone.createdCount).toBe(2)
      expect(secondDone.duplicateCount).toBe(1)
      expect(secondDone.malformedCount).toBe(1)
      const afterSecond = yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie))
      expect(afterSecond).toHaveLength(5)
      // The override created a second identical Coffee row — the Member's
      // choice; Salary still appears exactly once.
      expect(afterSecond.filter((entry) => entry.description === 'Coffee')).toHaveLength(2)
      expect(afterSecond.filter((entry) => entry.description === 'Salary')).toHaveLength(1)
      // -1999 - 400 + 200000 - 400 - 1500.
      expect(
        balanceOf(yield* readAccounts(yield* listAccounts(apiUrl, owner.cookie)), checking.id),
      ).toBe(195701)

      // Re-uploading an already-imported file: everything is flagged, and a
      // bodyless confirm succeeds creating nothing — the ledger is unchanged.
      const rerun = yield* readImport(
        yield* createImport(apiUrl, owner.cookie, {
          accountId: checking.id,
          fileName: 'march-a-again.csv',
          csv: [
            'Date,Description,Amount',
            '2026-03-01,Streaming service,-19.99',
            '2026-03-02,Coffee,-4.00',
            '2026-03-03,Salary,2000.00',
          ].join('\n'),
        }),
      )
      const rerunPreview = yield* readPreview(
        yield* previewImport(apiUrl, owner.cookie, rerun.id, MAPPING),
      )
      expect(rerunPreview.rows.every((row) => row.duplicate)).toBe(true)
      const rerunDone = yield* readImport(yield* confirmImport(apiUrl, owner.cookie, rerun.id))
      expect(rerunDone.status).toBe('confirmed')
      expect(rerunDone.createdCount).toBe(0)
      expect(rerunDone.duplicateCount).toBe(3)
      expect(yield* readTransactions(yield* listTransactions(apiUrl, owner.cookie))).toHaveLength(5)

      // Dedup is account-scoped: the same rows into another Account are not
      // duplicates, and an explicit empty overrides body works like none.
      const savings = yield* readAccount(
        yield* createAccount(apiUrl, owner.cookie, {
          name: 'Savings',
          type: 'savings',
          openingBalance: 0,
        }),
      )
      const elsewhere = yield* readImport(
        yield* createImport(apiUrl, owner.cookie, {
          accountId: savings.id,
          fileName: 'savings.csv',
          csv: 'Date,Description,Amount\n2026-03-02,Coffee,-4.00\n',
        }),
      )
      const elsewherePreview = yield* readPreview(
        yield* previewImport(apiUrl, owner.cookie, elsewhere.id, MAPPING),
      )
      expect(elsewherePreview.rows.map((row) => row.duplicate)).toEqual([false])
      const elsewhereDone = yield* readImport(
        yield* confirmImport(apiUrl, owner.cookie, elsewhere.id, { overrides: [] }),
      )
      expect(elsewhereDone.createdCount).toBe(1)
      expect(elsewhereDone.duplicateCount).toBe(0)

      // The history reports every Import's dedup outcome.
      const history = yield* readImports(yield* listImports(apiUrl, owner.cookie))
      const byFile = Object.fromEntries(history.map((entry) => [entry.fileName, entry]))
      expect(byFile['march-a.csv']?.duplicateCount).toBe(1)
      expect(byFile['march-b.csv']?.duplicateCount).toBe(1)
      expect(byFile['march-a-again.csv']?.duplicateCount).toBe(3)
      expect(byFile['savings.csv']?.duplicateCount).toBe(0)
    }),
  { timeout: 600_000 },
)
