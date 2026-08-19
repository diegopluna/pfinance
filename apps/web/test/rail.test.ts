import { expect, test } from 'vite-plus/test'
import { railBar, railBars, railCap } from '../src/lib/rail.ts'

// --- The rail ---
// Mirrors apps/mobile/test/charts-rail.test.ts — the mirror in
// apps/web/src/lib/rail.ts must scale identically to the original.
// Signed amounts hang off a shared zero rule: money out to the left, money
// in to the right, Transfers and Balance Adjustments on the rule itself.
// The scale is the 90th-percentile magnitude in view, so one salary can't
// flatten a month of groceries into stubs.

test('the sign picks the side, and the cap sets the length', () => {
  const entries = [
    { amount: -8000, neutral: false },
    { amount: -4000, neutral: false },
    { amount: 8000, neutral: false },
  ]
  expect(railBars(entries)).toEqual([
    { side: 'out', fraction: 1, capped: false },
    { side: 'out', fraction: 0.5, capped: false },
    { side: 'in', fraction: 1, capped: false },
  ])
})

test('Transfers and Balance Adjustments draw no bar', () => {
  expect(railBar({ amount: -50000, neutral: true }, 1000)).toEqual({
    side: 'none',
    fraction: 0,
    capped: false,
  })
})

test('a neutral entry never sets the scale it does not draw on', () => {
  expect(
    railCap([
      { amount: -900000, neutral: true },
      { amount: -2000, neutral: false },
    ]),
  ).toBe(2000)
})

test('the top quarter overflows instead of flattening the rest', () => {
  // Nine grocery-sized expenses and one salary: the cap lands in the body of
  // the distribution, so the salary and the largest expenses run to the frame
  // and end square while the small amounts keep a readable spread. Scaled to
  // the salary instead, every grocery run would be a 2% stub.
  const entries = [
    ...Array.from({ length: 9 }, (_, index) => ({ amount: -(index + 1) * 1000, neutral: false })),
    { amount: 5_000_00, neutral: false },
  ]
  const bars = railBars(entries)
  expect(railCap(entries)).toBe(8000)
  expect(bars[0]).toEqual({ side: 'out', fraction: 0.125, capped: false })
  expect(bars[7]).toEqual({ side: 'out', fraction: 1, capped: false })
  expect(bars[8]).toEqual({ side: 'out', fraction: 1, capped: true })
  expect(bars[9]).toEqual({ side: 'in', fraction: 1, capped: true })
})

test('a short list scales to its own largest, with nothing capped', () => {
  const entries = [
    { amount: -1000, neutral: false },
    { amount: -2000, neutral: false },
    { amount: 8000, neutral: false },
  ]
  expect(railCap(entries)).toBe(8000)
  expect(railBars(entries).some((bar) => bar.capped)).toBe(false)
})

test('a zero amount sits on the rule, and an empty view still scales', () => {
  expect(railBar({ amount: 0, neutral: false }, 1000)).toEqual({
    side: 'none',
    fraction: 0,
    capped: false,
  })
  expect(railCap([])).toBe(1)
  expect(railBars([{ amount: 0, neutral: false }])).toEqual([
    { side: 'none', fraction: 0, capped: false },
  ])
})
