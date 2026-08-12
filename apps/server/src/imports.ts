import {
  getCurrency,
  isSupportedCurrency,
  toMinorUnits,
  type CurrencyCode,
} from '@pfinance/currency'
import { account, csvImport, household, transaction, type Db } from '@pfinance/db'
import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm'
import type { Parsed, VerbResult } from './parsed.ts'
import type { Scope } from './scope.ts'
import { isCalendarDate } from './transactions.ts'

// Parsing for the /api/imports surface (issue #13): CSV text → records,
// cells → calendar dates and integer minor units (ADR 0006), records +
// mapping → preview rows. Malformed rows are surfaced with their line and
// offending cell, never silently dropped. Pure functions — the routes in
// index.ts own the DB.

export interface CsvRecord {
  /** 1-based line the record starts on — truthful across quoted newlines. */
  line: number
  cells: string[]
}

// RFC 4180-ish: comma-separated, LF or CRLF, double quotes wrap cells that
// contain commas, quotes ("" escapes one), or newlines. Blank lines are not
// records, but the lines they occupy still count.
export const parseCsv = (text: string): CsvRecord[] => {
  const records: CsvRecord[] = []
  let cells: string[] = []
  let cell = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1
  const endRecord = () => {
    cells.push(cell)
    cell = ''
    if (cells.length > 1 || cells[0] !== '') {
      records.push({ line: recordLine, cells })
    }
    cells = []
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      if (inQuotes) {
        cell += '\n'
      } else {
        endRecord()
        recordLine = line + 1
      }
      line++
    } else if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
    } else if (char === '"' && cell === '') {
      inQuotes = true
    } else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else {
      cell += char
    }
  }
  if (cell !== '' || cells.length > 0) endRecord()
  return records
}

// The three date shapes banks export, named by part order; the separator may
// be -, / or . in any of them. Two-digit years are rejected — guessing the
// century would silently misdate a ledger.
export const IMPORT_DATE_FORMAT_VALUES = ['ymd', 'dmy', 'mdy'] as const

export type ImportDateFormat = (typeof IMPORT_DATE_FORMAT_VALUES)[number]

export const isImportDateFormat = (value: unknown): value is ImportDateFormat =>
  (IMPORT_DATE_FORMAT_VALUES as readonly unknown[]).includes(value)

export const DATE_FORMAT_LABELS: Record<ImportDateFormat, string> = {
  ymd: 'YYYY-MM-DD',
  dmy: 'DD/MM/YYYY',
  mdy: 'MM/DD/YYYY',
}

const DATE_PARTS = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$/

/** Cell → ISO `YYYY-MM-DD`, or undefined when it isn't a real date in the format. */
export const parseCsvDate = (cell: string, format: ImportDateFormat): string | undefined => {
  const match = DATE_PARTS.exec(cell.trim())
  if (match === null) return undefined
  const [, first = '', second = '', third = ''] = match
  const [year, month, day] =
    format === 'ymd'
      ? [first, second, third]
      : format === 'dmy'
        ? [third, second, first]
        : [third, first, second]
  if (year.length !== 4 || day.length > 2) return undefined
  const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return isCalendarDate(date) ? date : undefined
}

// Integer-part digit grouping: bare digits, or 1–3 digits followed by
// consistent groups of exactly 3 ("1.234.567", never "12,34").
const groupedDigits = /^\d{1,3}(?:([.,])\d{3})(?:\1\d{3})*$/

const stripGrouping = (part: string): string | undefined => {
  if (/^\d+$/.test(part)) return part
  return groupedDigits.test(part) ? part.replaceAll(/[.,]/g, '') : undefined
}

/**
 * Bank-style amount cell → signed integer minor units, or undefined. Handles
 * either separator convention (the last of `.`/`,` is the decimal one when
 * both appear), space thousands, accounting parentheses, and a lone
 * three-digit group read by the Currency's exponent. Precision beyond the
 * Currency is rejected (toMinorUnits), never rounded.
 */
export const parseCsvAmount = (cell: string, currency: CurrencyCode): number | undefined => {
  let text = cell.trim()
  let sign = ''
  if (text.startsWith('(') && text.endsWith(')')) {
    sign = '-'
    text = text.slice(1, -1).trim()
  } else if (text.startsWith('-')) {
    sign = '-'
    text = text.slice(1).trim()
  } else if (text.startsWith('+')) {
    text = text.slice(1).trim()
  }
  // \s covers regular and no-break spaces — space-grouped thousands.
  text = text.replaceAll(/\s/g, '')
  if (text === '' || !/^[\d.,]+$/.test(text)) return undefined
  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  let decimalAt = -1
  if (lastDot !== -1 && lastComma !== -1) {
    decimalAt = Math.max(lastDot, lastComma)
  } else if (lastDot !== -1 || lastComma !== -1) {
    const at = Math.max(lastDot, lastComma)
    const separator = text[at]
    const single = text.indexOf(separator ?? '') === at
    const digitsAfter = text.length - at - 1
    // A lone separator is a decimal point unless it reads as a thousands
    // group — exactly 3 digits after — which itself reads as a decimal for a
    // 3-minor-digit Currency ("1.234" BHD).
    if (single && (digitsAfter !== 3 || getCurrency(currency).minorUnitExponent === 3)) {
      decimalAt = at
    }
  }
  const integerPart = decimalAt === -1 ? text : text.slice(0, decimalAt)
  const fractionPart = decimalAt === -1 ? '' : text.slice(decimalAt + 1)
  const digits = stripGrouping(integerPart)
  if (digits === undefined) return undefined
  if (fractionPart !== '' && !/^\d+$/.test(fractionPart)) return undefined
  try {
    return toMinorUnits(
      `${sign}${digits}${fractionPart === '' ? '' : `.${fractionPart}`}`,
      currency,
    )
  } catch {
    return undefined
  }
}

// Credit-card statements commonly invert the ledger's sign convention:
// positive = charge, negative = payment (issue #42). 'flip' negates every
// parsed amount so charges land as Expenses; absent means 'as-is'.
export const IMPORT_AMOUNT_SIGN_VALUES = ['as-is', 'flip'] as const

export type ImportAmountSign = (typeof IMPORT_AMOUNT_SIGN_VALUES)[number]

export const isImportAmountSign = (value: unknown): value is ImportAmountSign =>
  (IMPORT_AMOUNT_SIGN_VALUES as readonly unknown[]).includes(value)

// The column mapping a Member chooses on the map step: which cell is the
// date, the description, and the amount, plus the date shape and the amount
// sign strategy. Persisted on the Import as JSON so confirm creates exactly
// what preview showed. amountSign stays optional so mappings stored before
// issue #42 keep reading as as-is.
export interface ImportMapping {
  dateColumn: number
  descriptionColumn: number
  amountColumn: number
  dateFormat: ImportDateFormat
  amountSign?: ImportAmountSign
}

export interface ImportRowFields {
  date: string
  description: string
  amount: number
}

export interface PreviewRow {
  line: number
  /** The mapped cells verbatim, so a malformed row shows what the bank sent. */
  raw: { date: string; description: string; amount: string }
  parsed: ImportRowFields | null
  error: string | null
  /**
   * The parsed row exact-matches an existing Transaction (issue #14):
   * skipped on confirm unless the Member overrides it by line.
   */
  duplicate: boolean
}

/**
 * The exact-match identity dedup compares on — date + amount + description
 * (the account is the query's scope). JSON keeps the fields from colliding
 * however the description is shaped.
 */
export const duplicateKey = (fields: ImportRowFields): string =>
  JSON.stringify([fields.date, fields.amount, fields.description])

const previewRow = (
  record: CsvRecord,
  mapping: ImportMapping,
  currency: CurrencyCode,
): PreviewRow => {
  const raw = {
    date: record.cells[mapping.dateColumn] ?? '',
    description: record.cells[mapping.descriptionColumn] ?? '',
    amount: record.cells[mapping.amountColumn] ?? '',
  }
  const failed = (error: string): PreviewRow => ({
    line: record.line,
    raw,
    parsed: null,
    error,
    duplicate: false,
  })
  const needed = Math.max(mapping.dateColumn, mapping.descriptionColumn, mapping.amountColumn) + 1
  if (record.cells.length < needed) {
    return failed(`The row has ${record.cells.length} columns; the mapping needs ${needed}.`)
  }
  const date = parseCsvDate(raw.date, mapping.dateFormat)
  if (date === undefined) {
    return failed(`Not a ${DATE_FORMAT_LABELS[mapping.dateFormat]} date: "${raw.date}"`)
  }
  const parsedAmount = parseCsvAmount(raw.amount, currency)
  if (parsedAmount === undefined) {
    return failed(`Not a ${currency} amount: "${raw.amount}"`)
  }
  // The flip happens here, before dedup and confirm ever see the row, so
  // every downstream consumer works with ledger-true signs. The zero guard
  // keeps -0 out of the ledger.
  const amount = mapping.amountSign === 'flip' && parsedAmount !== 0 ? -parsedAmount : parsedAmount
  const description = raw.description.trim()
  if (description === '') {
    return failed('The description is empty.')
  }
  return {
    line: record.line,
    raw,
    parsed: { date, description, amount },
    error: null,
    duplicate: false,
  }
}

/**
 * Data records (header excluded) + mapping → one preview row each, not yet
 * duplicate-flagged (flagDuplicates owns that, once the ledger is queried).
 */
export const previewRows = (
  records: CsvRecord[],
  mapping: ImportMapping,
  currency: CurrencyCode,
): PreviewRow[] => records.map((record) => previewRow(record, mapping, currency))

/**
 * Flags every row whose parsed fields appear in `existing` (duplicateKey per
 * Transaction already on the Account). Malformed rows never flag — there is
 * nothing parsed to match.
 */
export const flagDuplicates = (rows: PreviewRow[], existing: ReadonlySet<string>): PreviewRow[] =>
  rows.map((row) =>
    row.parsed !== null && existing.has(duplicateKey(row.parsed))
      ? { ...row, duplicate: true }
      : row,
  )

// Upload caps: bank exports are small, and the file is stored as one D1 TEXT
// cell, so both bytes and rows are bounded loudly — an oversize file is
// rejected with the limit, never truncated.
export const IMPORT_MAX_CHARS = 512 * 1024
export const IMPORT_MAX_ROWS = 2000

export interface NewImportFields {
  accountId: string
  fileName: string
  csv: string
}

export const parseNewImport = (body: unknown): Parsed<NewImportFields> => {
  const record = (body ?? {}) as Record<string, unknown>
  if (typeof record.accountId !== 'string' || record.accountId === '') {
    return { ok: false, error: 'An import needs an account.' }
  }
  const fileName = typeof record.fileName === 'string' ? record.fileName.trim() : ''
  if (fileName === '') {
    return { ok: false, error: 'An import needs the file name.' }
  }
  if (typeof record.csv !== 'string' || record.csv.trim() === '') {
    return { ok: false, error: 'An import needs the CSV text.' }
  }
  if (record.csv.length > IMPORT_MAX_CHARS) {
    return {
      ok: false,
      error: `The CSV is too large — the limit is ${IMPORT_MAX_CHARS / 1024} KB.`,
    }
  }
  return { ok: true, value: { accountId: record.accountId, fileName, csv: record.csv } }
}

const parseColumn = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined

// Structural validation only: whether the named columns exist in the file is
// checked against the header where the Import is loaded (index.ts).
export const parseImportMapping = (body: unknown): Parsed<ImportMapping> => {
  const record = (body ?? {}) as Record<string, unknown>
  const dateColumn = parseColumn(record.dateColumn)
  const descriptionColumn = parseColumn(record.descriptionColumn)
  const amountColumn = parseColumn(record.amountColumn)
  if (dateColumn === undefined || descriptionColumn === undefined || amountColumn === undefined) {
    return {
      ok: false,
      error: 'A mapping names the date, description, and amount columns by index.',
    }
  }
  // Absent means ISO — the unambiguous default; anything sent must be known.
  const dateFormat = record.dateFormat === undefined ? 'ymd' : record.dateFormat
  if (!isImportDateFormat(dateFormat)) {
    return { ok: false, error: 'The date format must be "ymd", "dmy", or "mdy".' }
  }
  // Absent means as-is; anything sent must be known — an ignored flip would
  // import a whole statement inverted.
  if (record.amountSign !== undefined && !isImportAmountSign(record.amountSign)) {
    return { ok: false, error: 'The amount sign must be "as-is" or "flip".' }
  }
  return {
    ok: true,
    value: {
      dateColumn,
      descriptionColumn,
      amountColumn,
      dateFormat,
      ...(record.amountSign !== undefined && { amountSign: record.amountSign }),
    },
  }
}

export interface ImportConfirmFields {
  /** File lines of flagged rows the Member chose to import anyway. */
  overrides: number[]
}

// Confirm's body is optional — absent means "skip every flagged duplicate".
// Lines that aren't flagged duplicates are harmless: an override only ever
// admits a row the preview flagged.
export const parseImportConfirm = (body: unknown): Parsed<ImportConfirmFields> => {
  const record = (body ?? {}) as Record<string, unknown>
  const overrides = record.overrides === undefined ? [] : record.overrides
  if (
    !Array.isArray(overrides) ||
    !overrides.every((line) => typeof line === 'number' && Number.isSafeInteger(line) && line > 0)
  ) {
    return { ok: false, error: 'Overrides name flagged rows by their file line.' }
  }
  return { ok: true, value: { overrides } }
}

export const mappingColumnError = (
  mapping: ImportMapping,
  columnCount: number,
): string | undefined => {
  const highest = Math.max(mapping.dateColumn, mapping.descriptionColumn, mapping.amountColumn)
  return highest < columnCount
    ? undefined
    : `The file has ${columnCount} columns; the mapping names column ${highest + 1}.`
}

// The API shape of an Import: the row minus the raw CSV (large, and clients
// re-read it through preview), with status derived from confirmedAt — the
// invite pattern, so pending vs confirmed can never disagree with the
// timestamps.
export const importView = (row: typeof csvImport.$inferSelect) => ({
  id: row.id,
  accountId: row.accountId,
  fileName: row.fileName,
  status: (row.confirmedAt === null ? 'pending' : 'confirmed') as 'pending' | 'confirmed',
  mapping: row.mapping === null ? null : (JSON.parse(row.mapping) as ImportMapping),
  rowCount: row.rowCount,
  createdCount: row.createdCount,
  malformedCount: row.malformedCount,
  duplicateCount: row.duplicateCount,
  createdAt: row.createdAt,
  confirmedAt: row.confirmedAt,
})

// Tenancy rides on the Account, like Transactions: reads join through it.
export const findImport = async (db: Db, householdId: string, id: string) => {
  const [found] = await db
    .select({ row: csvImport })
    .from(csvImport)
    .innerJoin(account, eq(account.id, csvImport.accountId))
    .where(and(eq(csvImport.id, id), eq(account.householdId, householdId)))
    .limit(1)
  return found?.row
}

// Import history, newest upload first; id breaks same-second ties.
export const listImports = async (db: Db, householdId: string) => {
  const rows = await db
    .select({ row: csvImport })
    .from(csvImport)
    .innerJoin(account, eq(account.id, csvImport.accountId))
    .where(eq(account.householdId, householdId))
    .orderBy(desc(csvImport.createdAt), asc(csvImport.id))
  return rows.map(({ row }) => importView(row))
}

// D1 caps bound parameters per statement at 100; a Transaction row binds 12
// columns, so 8 rows per INSERT stays clear of the cap.
export const IMPORT_INSERT_CHUNK = 8

/**
 * Rows → ordered groups of at most `size`, none empty. Pure so the cap
 * arithmetic is testable — the local test database accepts statement sizes
 * real D1 would reject (db-harness.ts), so this split is verified here, not
 * by the harness.
 */
export const chunkRows = <T>(rows: T[], size: number = IMPORT_INSERT_CHUNK): T[][] => {
  const chunks: T[][] = []
  for (let at = 0; at < rows.length; at += size) {
    chunks.push(rows.slice(at, at + size))
  }
  return chunks
}

/**
 * The duplicateKeys already on the Account, for flagging preview rows
 * (issue #14). Bounded by the parsed rows' date range — ISO dates compare
 * lexicographically — which limits the scan to the export's window.
 */
const existingDuplicateKeys = async (
  db: Db,
  accountId: string,
  rows: PreviewRow[],
): Promise<Set<string>> => {
  const dates = rows.flatMap((row) => (row.parsed === null ? [] : [row.parsed.date]))
  const [first] = dates
  if (first === undefined) return new Set()
  let min = first
  let max = first
  for (const date of dates) {
    if (date < min) min = date
    if (date > max) max = date
  }
  const existing = await db
    .select({
      date: transaction.date,
      amount: transaction.amount,
      description: transaction.description,
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.accountId, accountId),
        gte(transaction.date, min),
        lte(transaction.date, max),
      ),
    )
  return new Set(existing.map(duplicateKey))
}

/**
 * Parse + duplicate-flag in one step. Preview and confirm both run this
 * pipeline over the same stored bytes, so a row's fate can never differ
 * between what the preview showed and what confirm skips or creates.
 */
export const flaggedPreviewRows = async (
  db: Db,
  accountId: string,
  records: CsvRecord[],
  mapping: ImportMapping,
  currency: CurrencyCode,
): Promise<PreviewRow[]> => {
  const rows = previewRows(records, mapping, currency)
  return flagDuplicates(rows, await existingDuplicateKeys(db, accountId, rows))
}

// Amount cells parse in the Household's Currency (ADR 0002). The code is
// validated at sign-up, so the USD arm only narrows the type.
export const householdCurrency = async (db: Db, householdId: string): Promise<CurrencyCode> => {
  const [row] = await db
    .select({ currency: household.currency })
    .from(household)
    .where(eq(household.id, householdId))
    .limit(1)
  return isSupportedCurrency(row?.currency) ? row.currency : 'USD'
}

export type ImportView = ReturnType<typeof importView>

/**
 * An Import with its stored bytes parsed — the one place the CSV is re-read.
 * The read routes and confirm all load through this, so "which records does
 * this Import hold" can never be answered two ways. Undefined when the id
 * isn't the Household's (tenancy rides on the Account, findImport).
 */
export const loadImport = async (db: Db, scope: Scope, id: string) => {
  const row = await findImport(db, scope.householdId, id)
  if (row === undefined) return undefined
  const [header, ...records] = parseCsv(row.csv)
  return { row, header, records }
}

/**
 * The confirm write path (issues #13/#14/#15): re-parse the stored bytes
 * with the stored mapping, re-check duplicates against the ledger, admit
 * flagged rows only where overridden, and land the Transactions and the
 * confirmation in one atomic batch. Transaction ids are deterministic per
 * (Import, line) — the categories-seeding trick: two racing confirms build
 * the same ids, so the loser's batch collides on the primary key and rolls
 * back whole. The ledger can never receive the same batch twice.
 */
export const confirmImport = async (
  db: Db,
  scope: Scope,
  importId: string,
  { overrides }: ImportConfirmFields,
): Promise<VerbResult<ImportView>> => {
  const loaded = await loadImport(db, scope, importId)
  if (loaded === undefined) {
    return { ok: false, status: 404, error: 'Import not found.' }
  }
  const { row: found, records } = loaded
  if (found.confirmedAt !== null) {
    return { ok: false, status: 400, error: 'This import is already confirmed.' }
  }
  if (found.mapping === null) {
    return { ok: false, status: 400, error: 'Map the columns and preview before confirming.' }
  }
  const mapping = JSON.parse(found.mapping) as ImportMapping
  // Duplicates are re-checked against the ledger now, not trusted from the
  // preview: whatever landed since can never be double-counted.
  const rows = await flaggedPreviewRows(
    db,
    found.accountId,
    records,
    mapping,
    await householdCurrency(db, scope.householdId),
  )
  const valid = rows.flatMap((row) =>
    row.parsed === null ? [] : [{ line: row.line, duplicate: row.duplicate, fields: row.parsed }],
  )
  if (valid.length === 0) {
    return { ok: false, status: 400, error: 'No row parses with this mapping; nothing to import.' }
  }
  const overridden = new Set(overrides)
  // The Member's choices: flagged rows are skipped unless overridden by
  // line. Admitting zero rows is a fine outcome — re-uploading an
  // already-imported file confirms cleanly and creates nothing.
  const admitted = valid.filter((row) => !row.duplicate || overridden.has(row.line))
  const confirmedAt = new Date()
  const transactionRows = admitted.map(({ line, fields }) => ({
    id: `${found.id}:${line}`,
    accountId: found.accountId,
    ...fields,
    // All Uncategorized — the honest default for fresh imports (CONTEXT.md)
    // — and each row remembers its Import.
    kind: 'standard' as const,
    categoryId: null,
    transferId: null,
    importId: found.id,
    createdBy: scope.userId,
    createdAt: confirmedAt,
  }))
  const counts = {
    createdCount: admitted.length,
    malformedCount: rows.length - valid.length,
    duplicateCount: valid.length - admitted.length,
  }
  const inserts = chunkRows(transactionRows).map((chunk) => db.insert(transaction).values(chunk))
  // One atomic batch: the Transactions and the confirmation land together or
  // not at all.
  try {
    await db.batch([
      db
        .update(csvImport)
        .set({ ...counts, confirmedAt })
        .where(and(eq(csvImport.id, found.id), isNull(csvImport.confirmedAt))),
      ...inserts,
    ])
  } catch (error) {
    // The expected failure is the deterministic-id collision above: a
    // concurrent confirm won the race. Re-check rather than guess.
    const now = await findImport(db, scope.householdId, found.id)
    if (now?.confirmedAt != null) {
      return { ok: false, status: 400, error: 'This import is already confirmed.' }
    }
    throw error
  }
  return { ok: true, value: importView({ ...found, ...counts, confirmedAt }) }
}
