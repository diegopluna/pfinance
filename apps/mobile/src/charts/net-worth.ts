// The Net Worth headline, shared by the home screen and the Net Worth
// dashboard (issue #79) so the two never disagree about the same number.
// The series arrives server-derived (ADR 0001) in month order; everything
// here is the reading of its last two points. Free of react-native imports
// so the workspace's node test runner covers it.

export interface NetWorthPoint {
  month: string
  netWorth: number
}

export interface NetWorthHeadline {
  current: number
  /** Change against the previous month, or null when there isn't one. */
  delta: number | null
  /** The change as a fraction of the previous month, magnitude only. Null
      when the previous month was exactly zero — a percentage against zero
      is not a fact, and "∞%" is not a number a household can act on. */
  pct: number | null
  previousMonth: string | null
}

export const netWorthHeadline = (series: NetWorthPoint[]): NetWorthHeadline | null => {
  const current = series.at(-1)
  if (current === undefined) return null
  const previous = series.at(-2)
  if (previous === undefined) {
    return { current: current.netWorth, delta: null, pct: null, previousMonth: null }
  }
  const delta = current.netWorth - previous.netWorth
  return {
    current: current.netWorth,
    delta,
    pct: previous.netWorth === 0 ? null : Math.abs(delta / previous.netWorth),
    previousMonth: previous.month,
  }
}
