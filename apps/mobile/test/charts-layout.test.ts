import { expect, test } from 'vite-plus/test'
import { monthLabelAnchor, lineLayout, monthTickIndices, valueTicks } from '../src/charts/layout.ts'

// --- Value-axis ticks (issue #79) ---
// Nice round gridline values covering the data's range in minor units —
// the labels render through compactAmount, the geometry maps tick-to-tick.
// Expected arrays are worked examples against the 1/2/5 step ladder.

test('ticks cover the range on a nice step', () => {
  expect(valueTicks(0, 100000)).toEqual([0, 50000, 100000])
})

test('a negative floor stays covered — net worth lives below zero too', () => {
  expect(valueTicks(-50000, 125000)).toEqual([-100000, 0, 100000, 200000])
})

test('a flat series still gets a band around it', () => {
  expect(valueTicks(500, 500)).toEqual([400, 500, 600])
})

// --- The Net Worth line (issue #17's series, drawn natively) ---
// Values map tick-to-tick onto the frame — first gridline at the bottom
// edge, last at the top — and the area closes to the frame's bottom, the
// recharts baseline the web chart uses. Worked on a 100×100 frame so every
// coordinate is checkable by hand.

test('lineLayout maps values onto the frame and builds both paths', () => {
  const layout = lineLayout([0, 100000], { width: 100, height: 100 })
  expect(layout.ticks).toEqual([
    { value: 0, y: 100 },
    { value: 50000, y: 50 },
    { value: 100000, y: 0 },
  ])
  expect(layout.points).toEqual([
    { x: 0, y: 100 },
    { x: 100, y: 0 },
  ])
  expect(layout.linePath).toBe('M0 100L100 0')
  expect(layout.areaPath).toBe('M0 100L100 0L100 100L0 100Z')
})

test('lineLayout centers a single-month series', () => {
  const layout = lineLayout([500], { width: 100, height: 100 })
  expect(layout.ticks.map((tick) => tick.value)).toEqual([400, 500, 600])
  expect(layout.points).toEqual([{ x: 50, y: 50 }])
})

// --- Month axis labels ---
// A phone fits few of them, so the series labels a subset — stepping back
// from the latest month, because the newest label is the one being asked
// about.

test('monthTickIndices labels every month when they fit', () => {
  expect(monthTickIndices(3, 4)).toEqual([0, 1, 2])
})

test('monthTickIndices anchors to the latest month when thinning', () => {
  expect(monthTickIndices(13, 4)).toEqual([0, 4, 8, 12])
  expect(monthTickIndices(24, 4)).toEqual([5, 11, 17, 23])
})

test('monthTickIndices handles an empty series', () => {
  expect(monthTickIndices(0, 4)).toEqual([])
})

test('monthLabelAnchor anchors edge labels inward', () => {
  expect(monthLabelAnchor(0, 320)).toBe('start')
  expect(monthLabelAnchor(160, 320)).toBe('middle')
  expect(monthLabelAnchor(320, 320)).toBe('end')
})
