// The column-guessing heuristic for the Import map step: guess the mapping
// from the header names so most files start correct; the Member confirms or
// fixes it on the map step either way. Structurally assignable to the
// RPC-inferred MappingFields at the call sites, so drift fails the build
// without this module depending on the client types.
export interface GuessedMapping {
  dateColumn: number
  descriptionColumn: number
  amountColumn: number
  // ISO — the unambiguous default; the Member picks dmy/mdy when the file
  // says otherwise.
  dateFormat: 'ymd'
}

// First header matching the pattern wins; an unrecognizable header falls
// back to the conventional column order (date, description, amount),
// clamped to the file's width.
const guessColumn = (columns: string[], pattern: RegExp, fallback: number) => {
  const at = columns.findIndex((name) => pattern.test(name))
  return at === -1 ? Math.min(fallback, columns.length - 1) : at
}

// The language table: English, Portuguese, Spanish, French and German bank
// headers — the point of the heuristic, pinned by csv-mapping.test.ts.
export const guessMapping = (columns: string[]): GuessedMapping => ({
  dateColumn: guessColumn(columns, /date|data|dia|fecha/i, 0),
  descriptionColumn: guessColumn(columns, /desc|hist|memo|payee|narra|detail|concepto/i, 1),
  amountColumn: guessColumn(columns, /amount|valor|value|montant|betrag|importe/i, 2),
  dateFormat: 'ymd',
})
