import { expect, test } from 'vite-plus/test'
import { spendingRows } from '../src/charts/spending.ts'

// --- Spending rows (issue #18's slices, drawn natively) ---
// The server sends slices summed and largest-first; rows only add
// presentation: a label for the Uncategorized state, a bar fraction against
// the largest slice, and a palette slot. Slot order walks the five
// CVD-validated slots by categorized rank — an Uncategorized slice mid-list
// never shifts its neighbors' colors, and always renders the neutral grey
// (docs/design/DECISIONS.md).

test('rows carry labels, fractions against the largest, and ranked slots', () => {
  const rows = spendingRows([
    { categoryId: 'c-groceries', name: 'Groceries', total: 80000 },
    { categoryId: null, name: null, total: 60000 },
    { categoryId: 'c-rent', name: 'Rent', total: 40000 },
  ])
  expect(rows).toEqual([
    { key: 'c-groceries', label: 'Groceries', total: 80000, slot: 0, fraction: 1 },
    {
      key: 'uncategorized',
      label: 'Uncategorized',
      total: 60000,
      slot: 'uncategorized',
      fraction: 0.75,
    },
    { key: 'c-rent', label: 'Rent', total: 40000, slot: 1, fraction: 0.5 },
  ])
})

test('slots cycle past the five CVD-validated colors', () => {
  const rows = spendingRows(
    ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => ({
      categoryId: id,
      name: id.toUpperCase(),
      total: 600 - index * 100,
    })),
  )
  expect(rows.map((row) => row.slot)).toEqual([0, 1, 2, 3, 4, 0])
})

test('an empty month yields no rows', () => {
  expect(spendingRows([])).toEqual([])
})
