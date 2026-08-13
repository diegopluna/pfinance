// Spending-by-Category rows for the mobile chart (issue #79): pure
// presentation over the server's slices, which arrive summed and
// largest-first (apps/server/src/spending.ts) — nothing here re-sorts or
// re-sums. Free of react-native imports so the workspace's node test
// runner covers it.

export interface SpendingSliceInput {
  // null is the Uncategorized slice — a state, not a Category (CONTEXT.md);
  // the server sends it nameless and the client labels it.
  categoryId: string | null
  name: string | null
  total: number
}

export interface SpendingRow {
  key: string
  label: string
  total: number
  // Palette slot: an index into the five CVD-validated slots, or the
  // dedicated neutral grey for the Uncategorized state — a deliberate sixth
  // slot, never one of the five (docs/design/DECISIONS.md).
  slot: number | 'uncategorized'
  // Bar length against the largest slice; identity lives in the row label,
  // never in geometry or color alone.
  fraction: number
}

const SLOT_COUNT = 5

export const spendingRows = (slices: SpendingSliceInput[]): SpendingRow[] => {
  const largest = slices[0]?.total ?? 0
  // Slot index counts only categorized rows, so an Uncategorized slice
  // mid-list never shifts its neighbors' colors (the web chart's stance).
  let slotIndex = 0
  return slices.map((slice) => ({
    key: slice.categoryId ?? 'uncategorized',
    label: slice.name ?? 'Uncategorized',
    total: slice.total,
    slot: slice.categoryId === null ? 'uncategorized' : slotIndex++ % SLOT_COUNT,
    fraction: largest > 0 ? slice.total / largest : 0,
  }))
}
