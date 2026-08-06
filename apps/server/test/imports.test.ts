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
  createdAt: string
  confirmedAt: string | null
}

interface PreviewRow {
  line: number
  raw: { date: string; description: string; amount: string }
  parsed: { date: string; description: string; amount: number } | null
  error: string | null
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

const confirmRequest = (apiUrl: string, cookie: string, id: string) =>
  HttpClientRequest.post(`${apiUrl}/api/imports/${id}/confirm`).pipe(
    trustedOrigin,
    withCookie(cookie),
  )

const confirmImport = (apiUrl: string, cookie: string, id: string) =>
  Test.executeWhenReady(confirmRequest(apiUrl, cookie, id))

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
        },
        {
          line: 3,
          raw: { date: '16/01/2026', description: 'Tarifa', amount: '(12,00)' },
          parsed: { date: '2026-01-16', description: 'Tarifa', amount: -1200 },
          error: null,
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
