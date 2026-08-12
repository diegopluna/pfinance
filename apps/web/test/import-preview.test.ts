import { expect, test } from 'vite-plus/test'
import { summarizePreview, type PreviewRowFate } from '../src/lib/import-preview'

// --- The preview arithmetic (lib/import-preview.ts) ---
// The counts the wizard renders and the gate the confirm button obeys, over
// the duplicate × override × malformed matrix. No HTTP, no DOM.

const ready = (line: number, duplicate = false): PreviewRowFate => ({
  line,
  parsed: { date: '2026-01-01', description: 'row', amount: -1 },
  duplicate,
})

const malformed = (line: number): PreviewRowFate => ({ line, parsed: null, duplicate: false })

test('clean rows all import', () => {
  expect(summarizePreview([ready(2), ready(3)], new Set())).toEqual({
    total: 2,
    ready: 2,
    malformed: 0,
    skippedDuplicates: 0,
    importCount: 2,
    canConfirm: true,
  })
})

test('duplicates are skipped by default and admitted per-line on override', () => {
  const rows = [ready(2, true), ready(3, true), ready(4)]
  expect(summarizePreview(rows, new Set())).toMatchObject({
    skippedDuplicates: 2,
    importCount: 1,
  })
  expect(summarizePreview(rows, new Set([3]))).toMatchObject({
    skippedDuplicates: 1,
    importCount: 2,
  })
  // Overriding a line that isn't a duplicate is harmless.
  expect(summarizePreview(rows, new Set([4, 99]))).toMatchObject({
    skippedDuplicates: 2,
    importCount: 1,
  })
})

test('malformed rows never import and never count as duplicates', () => {
  expect(summarizePreview([malformed(2), ready(3, true), malformed(4)], new Set())).toEqual({
    total: 3,
    ready: 1,
    malformed: 2,
    skippedDuplicates: 1,
    importCount: 0,
    canConfirm: true,
  })
})

test('every ready row a skipped duplicate: importCount 0, confirm still possible', () => {
  // Re-uploading an already-imported file finishes cleanly, creating nothing.
  expect(summarizePreview([ready(2, true), ready(3, true)], new Set())).toMatchObject({
    importCount: 0,
    canConfirm: true,
  })
})

test('nothing parses: confirm is impossible', () => {
  expect(summarizePreview([malformed(2), malformed(3)], new Set())).toMatchObject({
    ready: 0,
    importCount: 0,
    canConfirm: false,
  })
  expect(summarizePreview([], new Set())).toMatchObject({ canConfirm: false })
})
