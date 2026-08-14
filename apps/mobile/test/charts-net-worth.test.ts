import { expect, test } from 'vite-plus/test'
import { netWorthHeadline } from '../src/charts/net-worth.ts'

// --- The Net Worth headline ---
// The home screen and the Net Worth dashboard read the same last two points
// of the server-derived series, so they can never quote different numbers.

test('the headline is the last point and its change against the one before', () => {
  expect(
    netWorthHeadline([
      { month: '2026-06', netWorth: 400000 },
      { month: '2026-07', netWorth: 500000 },
    ]),
  ).toEqual({ current: 500000, delta: 100000, pct: 0.25, previousMonth: '2026-06' })
})

test('a fall keeps its sign and reports magnitude for the percentage', () => {
  const headline = netWorthHeadline([
    { month: '2026-06', netWorth: 500000 },
    { month: '2026-07', netWorth: 250000 },
  ])
  expect(headline?.delta).toBe(-250000)
  expect(headline?.pct).toBe(0.5)
})

test('a first month has a value but no change to report', () => {
  expect(netWorthHeadline([{ month: '2026-07', netWorth: 500000 }])).toEqual({
    current: 500000,
    delta: null,
    pct: null,
    previousMonth: null,
  })
})

test('a percentage against a zero month is not reported, but the delta is', () => {
  const headline = netWorthHeadline([
    { month: '2026-06', netWorth: 0 },
    { month: '2026-07', netWorth: 120000 },
  ])
  expect(headline?.delta).toBe(120000)
  expect(headline?.pct).toBe(null)
})

test('an empty series has no headline', () => {
  expect(netWorthHeadline([])).toBe(null)
})
