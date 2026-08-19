import { expect, test } from 'vite-plus/test'
import { oldestUpdatedAt, staleLabel } from '../src/api/staleness.ts'

// --- The offline banner's age (issue #83) ---
// The banner quotes the cache's own updated-at: the oldest stamp among the
// queries a screen shows, so it promises no row is staler than it says.

test('the oldest shown query sets the age', () => {
  const queries = [
    { data: {}, dataUpdatedAt: 3000 },
    { data: {}, dataUpdatedAt: 1000 },
    { data: {}, dataUpdatedAt: 2000 },
  ]
  expect(oldestUpdatedAt(queries)).toBe(1000)
})

test('queries with nothing to show carry no stamp', () => {
  expect(oldestUpdatedAt([{ data: undefined, dataUpdatedAt: 5000 }])).toBeNull()
  expect(oldestUpdatedAt([{ data: {}, dataUpdatedAt: 0 }])).toBeNull()
  expect(oldestUpdatedAt([])).toBeNull()
})

test('the label is coarse on purpose', () => {
  const now = 1_000_000_000
  expect(staleLabel(now - 30_000, now)).toBe('moments ago')
  expect(staleLabel(now - 5 * 60_000, now)).toBe('5 min ago')
  expect(staleLabel(now - 2 * 3_600_000, now)).toBe('2 h ago')
  expect(staleLabel(now - 24 * 3_600_000, now)).toBe('1 day ago')
  expect(staleLabel(now - 72 * 3_600_000, now)).toBe('3 days ago')
})

test('a clock that ran backwards still reads as fresh', () => {
  expect(staleLabel(2000, 1000)).toBe('moments ago')
})
