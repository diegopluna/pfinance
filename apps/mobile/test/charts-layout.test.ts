import { expect, test } from 'vite-plus/test'
import {
  monthLabelAnchor,
  lineLayout,
  monthTickIndices,
  pairedBarsLayout,
  topRoundedBarPath,
  valueTicks,
} from '../src/charts/layout.ts'

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

// --- Income vs expense paired bars (issue #19's months, drawn natively) ---
// Both totals are magnitudes off a zero baseline; each month owns an equal
// band with the income bar left of center, expense right — the web pairing.
// Worked on hand-checkable frames.

test('pairedBarsLayout sizes both bars off the zero baseline', () => {
  const layout = pairedBarsLayout([{ income: 100000, expense: 50000 }], {
    width: 100,
    height: 100,
  })
  expect(layout.ticks.map((tick) => tick.value)).toEqual([0, 50000, 100000])
  expect(layout.bars).toEqual([
    {
      x: 50,
      income: { x: 37, y: 0, width: 12, height: 100 },
      expense: { x: 51, y: 50, width: 12, height: 50 },
    },
  ])
})

test('pairedBarsLayout gives each month an equal band', () => {
  const layout = pairedBarsLayout(
    [
      { income: 100000, expense: 0 },
      { income: 0, expense: 100000 },
    ],
    { width: 200, height: 100 },
  )
  expect(layout.bars.map((bar) => bar.x)).toEqual([50, 150])
  // A quiet side still gets a bar entry — zero height, sitting on the
  // baseline — so the pair never collapses into a lone bar.
  expect(layout.bars[0]?.expense).toEqual({ x: 51, y: 100, width: 12, height: 0 })
})

test('pairedBarsLayout survives an all-zero window with a default band', () => {
  const layout = pairedBarsLayout([{ income: 0, expense: 0 }], { width: 100, height: 100 })
  expect(layout.ticks.map((tick) => tick.value)).toEqual([0, 50, 100])
})

// --- Month-label selection ---
// A phone fits few axis labels, so a subset is chosen by stepping back from
// the latest month — the newest label always renders, the oldest may not.

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

// --- Top-rounded bar paths ---
// The web bars round at the data end and stay square on the baseline
// (radius [4,4,0,0]); a plain Rect rounds all four corners, so the bar is a
// path. Worked example: corners as quadratic curves, radius clamped to the
// bar's own size, and a zero-height bar draws nothing.

test('topRoundedBarPath rounds only the data end', () => {
  expect(topRoundedBarPath({ x: 0, y: 0, width: 12, height: 20 }, 4)).toBe(
    'M0 20V4Q0 0 4 0H8Q12 0 12 4V20Z',
  )
})

test('topRoundedBarPath clamps the radius to a short bar', () => {
  expect(topRoundedBarPath({ x: 0, y: 18, width: 12, height: 2 }, 4)).toBe(
    'M0 20V20Q0 18 2 18H10Q12 18 12 20V20Z',
  )
})

test('topRoundedBarPath draws nothing for a zero-height bar', () => {
  expect(topRoundedBarPath({ x: 0, y: 100, width: 12, height: 0 }, 4)).toBe('')
})

// --- Month-label anchoring ---
// A label near either frame edge anchors inward so it never clips; the
// same rule serves both time-series charts.

test('monthLabelAnchor anchors edge labels inward', () => {
  expect(monthLabelAnchor(0, 320)).toBe('start')
  expect(monthLabelAnchor(160, 320)).toBe('middle')
  expect(monthLabelAnchor(320, 320)).toBe('end')
})
