import { expect, test } from 'vite-plus/test'
import {
  duplicateKey,
  flagDuplicates,
  parseCsv,
  parseCsvAmount,
  parseCsvDate,
  parseImportConfirm,
  previewRows,
  type ImportMapping,
} from '../src/imports.ts'

// --- CSV Import parsing (issue #13) ---
// The pure seam behind /api/imports: text → records, cells → calendar dates
// and integer minor units, records + mapping → preview rows with malformed
// ones surfaced. No HTTP, no DB — these run in-process.

test('parseCsv splits records and keeps 1-based line numbers', () => {
  expect(parseCsv('date,desc,amount\n2026-01-15,Coffee,-3.50\n')).toEqual([
    { line: 1, cells: ['date', 'desc', 'amount'] },
    { line: 2, cells: ['2026-01-15', 'Coffee', '-3.50'] },
  ])
})

test('parseCsv handles CRLF, quoted commas, and escaped quotes', () => {
  const records = parseCsv('a,b\r\n"1,000","say ""hi"""\r\n')
  expect(records).toEqual([
    { line: 1, cells: ['a', 'b'] },
    { line: 2, cells: ['1,000', 'say "hi"'] },
  ])
})

test('parseCsv keeps line numbers truthful across multi-line quoted cells and blank lines', () => {
  const records = parseCsv('h1,h2\n"two\nlines",x\n\nnext,y')
  expect(records).toEqual([
    { line: 1, cells: ['h1', 'h2'] },
    { line: 2, cells: ['two\nlines', 'x'] },
    // The blank line 4 is not a record; the next record still knows its line.
    { line: 5, cells: ['next', 'y'] },
  ])
})

test('parseCsvDate normalizes each supported format to YYYY-MM-DD', () => {
  expect(parseCsvDate('2026-01-15', 'ymd')).toBe('2026-01-15')
  expect(parseCsvDate('2026/1/5', 'ymd')).toBe('2026-01-05')
  expect(parseCsvDate('15/01/2026', 'dmy')).toBe('2026-01-15')
  expect(parseCsvDate('5.1.2026', 'dmy')).toBe('2026-01-05')
  expect(parseCsvDate('01/15/2026', 'mdy')).toBe('2026-01-15')
  expect(parseCsvDate('2024-02-29', 'ymd')).toBe('2024-02-29')
})

test('parseCsvDate rejects impossible dates, two-digit years, and format mismatches', () => {
  expect(parseCsvDate('2026-02-30', 'ymd')).toBeUndefined()
  expect(parseCsvDate('15/01/26', 'dmy')).toBeUndefined()
  expect(parseCsvDate('26-01-15', 'ymd')).toBeUndefined()
  expect(parseCsvDate('Jan 5, 2026', 'ymd')).toBeUndefined()
  // A day can't be a month: the format is a promise, not a hint.
  expect(parseCsvDate('15/01/2026', 'mdy')).toBeUndefined()
  expect(parseCsvDate('', 'ymd')).toBeUndefined()
})

test('parseCsvAmount converts bank-style decimals to integer minor units', () => {
  expect(parseCsvAmount('1234.56', 'USD')).toBe(123456)
  expect(parseCsvAmount('-1,234.56', 'USD')).toBe(-123456)
  expect(parseCsvAmount('+5.00', 'USD')).toBe(500)
  expect(parseCsvAmount('12', 'USD')).toBe(1200)
  // Accounting negatives.
  expect(parseCsvAmount('(12.34)', 'USD')).toBe(-1234)
  // European separators: the last separator is the decimal one.
  expect(parseCsvAmount('1.234,56', 'USD')).toBe(123456)
  expect(parseCsvAmount('1 234,56', 'USD')).toBe(123456)
  expect(parseCsvAmount('1,234,567.89', 'USD')).toBe(123456789)
})

test('parseCsvAmount reads a lone three-digit group by the currency exponent', () => {
  // "1,234" is a thousands group for two-decimal currencies…
  expect(parseCsvAmount('1,234', 'USD')).toBe(123400)
  expect(parseCsvAmount('1,234', 'JPY')).toBe(1234)
  // …but a decimal for a three-decimal currency like BHD.
  expect(parseCsvAmount('1.234', 'BHD')).toBe(1234)
})

test('parseCsvAmount rejects excess precision, malformed grouping, and non-numbers', () => {
  expect(parseCsvAmount('12.3456', 'USD')).toBeUndefined()
  expect(parseCsvAmount('1,234.567', 'USD')).toBeUndefined()
  expect(parseCsvAmount('12.34', 'JPY')).toBeUndefined()
  // A lone three-digit group reads as thousands for USD — never as an
  // over-precise decimal.
  expect(parseCsvAmount('12.345', 'USD')).toBe(1234500)
  expect(parseCsvAmount('12,34.56', 'USD')).toBeUndefined()
  expect(parseCsvAmount('abc', 'USD')).toBeUndefined()
  expect(parseCsvAmount('12.34 USD', 'USD')).toBeUndefined()
  expect(parseCsvAmount('', 'USD')).toBeUndefined()
})

const mapping: ImportMapping = {
  dateColumn: 0,
  descriptionColumn: 1,
  amountColumn: 2,
  dateFormat: 'ymd',
}

test('previewRows parses valid rows and surfaces malformed ones with their line and cell', () => {
  const records = parseCsv(
    [
      'Date,Memo,Value',
      '2026-01-15,Coffee,-3.50',
      'yesterday,Groceries,-10.00',
      '2026-01-16,Salary,not-money',
      '2026-01-17,,5.00',
      '2026-01-18,Refund',
    ].join('\n'),
  )
  const rows = previewRows(records.slice(1), mapping, 'USD')

  expect(rows).toHaveLength(5)
  expect(rows[0]).toEqual({
    line: 2,
    raw: { date: '2026-01-15', description: 'Coffee', amount: '-3.50' },
    parsed: { date: '2026-01-15', description: 'Coffee', amount: -350 },
    error: null,
    duplicate: false,
  })

  // Malformed rows are surfaced, never silently dropped: each names what
  // failed and echoes the offending cell.
  expect(rows[1]?.parsed).toBeNull()
  expect(rows[1]?.error).toContain('"yesterday"')
  expect(rows[1]?.error).toContain('YYYY-MM-DD')
  expect(rows[2]?.parsed).toBeNull()
  expect(rows[2]?.error).toContain('"not-money"')
  expect(rows[3]?.parsed).toBeNull()
  expect(rows[3]?.error).toMatch(/description/i)
  // A short row is missing mapped columns.
  expect(rows[4]?.parsed).toBeNull()
  expect(rows[4]?.error).toMatch(/column/i)
  expect(rows[4]?.raw).toEqual({ date: '2026-01-18', description: 'Refund', amount: '' })
})

test('previewRows honors the mapping: reordered columns and non-ISO dates', () => {
  const records = parseCsv('Valor,Data,Histórico\n"1.234,56",15/01/2026,"Depósito, ok"\n')
  const rows = previewRows(
    records.slice(1),
    { dateColumn: 1, descriptionColumn: 2, amountColumn: 0, dateFormat: 'dmy' },
    'BRL',
  )
  expect(rows).toEqual([
    {
      line: 2,
      raw: { date: '15/01/2026', description: 'Depósito, ok', amount: '1.234,56' },
      parsed: { date: '2026-01-15', description: 'Depósito, ok', amount: 123456 },
      error: null,
      duplicate: false,
    },
  ])
})

// --- Import dedup (issue #14): the pure key + flagging seam. ---

test('duplicateKey matches on exact date + amount + description and nothing looser', () => {
  const fields = { date: '2026-01-15', description: 'Coffee', amount: -350 }
  expect(duplicateKey({ ...fields })).toBe(duplicateKey(fields))
  expect(duplicateKey({ ...fields, date: '2026-01-16' })).not.toBe(duplicateKey(fields))
  expect(duplicateKey({ ...fields, amount: -351 })).not.toBe(duplicateKey(fields))
  expect(duplicateKey({ ...fields, description: 'coffee' })).not.toBe(duplicateKey(fields))
  // Delimiter-looking descriptions can't collide across fields.
  expect(duplicateKey({ date: '2026-01-15', description: '-350', amount: -350 })).not.toBe(
    duplicateKey({ date: '2026-01-15', description: '-350,-350', amount: -350 }),
  )
})

test('flagDuplicates flags rows whose parsed fields match an existing key; malformed rows never flag', () => {
  const records = parseCsv(
    [
      'Date,Memo,Value',
      '2026-01-15,Coffee,-3.50',
      '2026-01-16,Salary,1000.00',
      'bad-date,Coffee,-3.50',
    ].join('\n'),
  )
  const existing = new Set([
    duplicateKey({ date: '2026-01-15', description: 'Coffee', amount: -350 }),
  ])
  const rows = flagDuplicates(previewRows(records.slice(1), mapping, 'USD'), existing)
  expect(rows.map((row) => row.duplicate)).toEqual([true, false, false])
})

test('parseImportConfirm accepts absent or integer-line overrides and rejects other shapes', () => {
  expect(parseImportConfirm(undefined)).toEqual({ ok: true, value: { overrides: [] } })
  expect(parseImportConfirm({})).toEqual({ ok: true, value: { overrides: [] } })
  expect(parseImportConfirm({ overrides: [2, 5] })).toEqual({
    ok: true,
    value: { overrides: [2, 5] },
  })
  expect(parseImportConfirm({ overrides: 'all' }).ok).toBe(false)
  expect(parseImportConfirm({ overrides: [1.5] }).ok).toBe(false)
  expect(parseImportConfirm({ overrides: ['2'] }).ok).toBe(false)
  expect(parseImportConfirm({ overrides: [-1] }).ok).toBe(false)
})
