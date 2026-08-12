import { expect, test } from 'vite-plus/test'
import { guessMapping } from '../src/lib/csv-mapping'

// --- The column-guessing heuristic (lib/csv-mapping.ts) ---
// One fixture per language the regex table claims: the guess should land on
// the right columns for real bank headers, and fall back to conventional
// column order when nothing matches. No HTTP, no DOM.

test('US English bank header', () => {
  expect(guessMapping(['Date', 'Description', 'Amount'])).toMatchObject({
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
  })
})

test('Portuguese header (Nubank-style), shuffled order', () => {
  expect(guessMapping(['Valor', 'Data', 'Descrição'])).toMatchObject({
    dateColumn: 1,
    descriptionColumn: 2,
    amountColumn: 0,
  })
})

test('Spanish header', () => {
  expect(guessMapping(['Fecha', 'Concepto', 'Importe'])).toMatchObject({
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
  })
})

test('German header (Buchungstag matches nothing; Betrag does)', () => {
  // 'Buchungstag' misses the date patterns, so date falls back to column 0 —
  // which happens to be right; description and amount match outright.
  expect(guessMapping(['Buchungstag', 'Verwendungszweck-Details', 'Betrag'])).toMatchObject({
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
  })
})

test('French amount header', () => {
  expect(guessMapping(['Date', 'Libellé détail', 'Montant'])).toMatchObject({
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
  })
})

test('unrecognizable header falls back to conventional column order', () => {
  expect(guessMapping(['A', 'B', 'C', 'D'])).toMatchObject({
    dateColumn: 0,
    descriptionColumn: 1,
    amountColumn: 2,
  })
})

test('the fallback clamps to the file width and the format defaults to ISO', () => {
  expect(guessMapping(['X', 'Y'])).toEqual({
    dateColumn: 0,
    descriptionColumn: 1,
    // Fallback index 2 exceeds a two-column file: clamped to the last column.
    amountColumn: 1,
    dateFormat: 'ymd',
  })
})
