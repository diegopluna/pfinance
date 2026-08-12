// The Import preview arithmetic: every row's fate totaled into the counts
// the wizard renders and the gate the confirm button obeys. One off-by-one
// here would import the wrong rows, so import-preview.test.ts pins the
// duplicate × override × malformed matrix.

// The minimal shape of a preview row's fate (structurally satisfied by the
// RPC-inferred preview rows at the call site): parsed is null for a
// malformed row, and only flagged duplicates consult the overrides.
export interface PreviewRowFate {
  line: number
  parsed: unknown
  duplicate: boolean
}

export interface PreviewSummary {
  total: number
  ready: number
  malformed: number
  skippedDuplicates: number
  /** Rows confirm will actually create: ready minus unoverridden duplicates. */
  importCount: number
  /**
   * Whether confirm is possible at all: at least one row parses. Importing
   * zero rows (every ready row a skipped duplicate) is still a valid
   * confirm — re-uploading an already-imported file finishes cleanly.
   */
  canConfirm: boolean
}

export const summarizePreview = (
  rows: readonly PreviewRowFate[],
  overrides: ReadonlySet<number>,
): PreviewSummary => {
  const ready = rows.filter((row) => row.parsed !== null).length
  const skippedDuplicates = rows.filter(
    (row) => row.parsed !== null && row.duplicate && !overrides.has(row.line),
  ).length
  return {
    total: rows.length,
    ready,
    malformed: rows.length - ready,
    skippedDuplicates,
    importCount: ready - skippedDuplicates,
    canConfirm: ready > 0,
  }
}
