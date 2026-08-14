// The rail: this app's one visual device, and the phone's answer to a
// dashboard it has no room for. Every signed quantity in the product —
// a Transaction's amount, an Account's Balance, a month's income and
// expense — hangs off a single shared zero rule: money out runs left of it,
// money in runs right of it. So a list is also a chart, without a tooltip
// or a second screen.
//
// The device carries the domain rather than decorating it:
//   * Direction is the sign, never the kind (ADR 0001). A liability's
//     negative Balance leans left for the same reason a grocery bill does.
//   * A Transfer leg or Balance Adjustment moves the Balance but is neither
//     spending nor income "by definition" (docs/design/DECISIONS.md), so it
//     draws no bar at all — just its tick on the rule. The rule that every
//     spending surface states in a footnote is visible in the geometry.
//
// Pure geometry, free of react-native imports, so the workspace's node test
// runner covers it.

export interface RailEntry {
  /** Minor units, signed (ADR 0006). */
  amount: number
  /** A Transfer leg or Balance Adjustment: on the rule, never off it. */
  neutral: boolean
}

export interface RailBar {
  /** Which side of the rule the bar leaves from, in the form's own words. */
  side: 'out' | 'in' | 'none'
  /** 0…1 of the available side, against the cap. */
  fraction: number
  /** At or past the cap: the bar runs to the frame and ends in a notch. */
  capped: boolean
}

const NONE: RailBar = { side: 'none', fraction: 0, capped: false }

// One salary among thirty grocery runs would flatten every other bar to a
// stub, so the scale is the 75th-percentile magnitude in view rather than
// the largest: the top quarter overflows the frame instead of the rest
// disappearing into it. A ledger month is mostly small amounts around a few
// large ones, and this is the cut that keeps the small ones legible —
// 90th put the cap on the salary itself and flattened everything under it.
// At three entries or fewer the percentile is the largest one, so a short
// list simply scales to its own maximum and nothing is capped.
export const railCap = (entries: RailEntry[]): number => {
  const magnitudes = entries
    .filter((entry) => !entry.neutral)
    .map((entry) => Math.abs(entry.amount))
    .filter((magnitude) => magnitude > 0)
    .sort((left, right) => left - right)
  if (magnitudes.length === 0) return 1
  const index = Math.min(magnitudes.length - 1, Math.ceil(magnitudes.length * 0.75) - 1)
  // A window of only-zero amounts still divides safely.
  return magnitudes[Math.max(0, index)] ?? 1
}

export const railBar = (entry: RailEntry, cap: number): RailBar => {
  if (entry.neutral || entry.amount === 0) return NONE
  const magnitude = Math.abs(entry.amount)
  return {
    side: entry.amount < 0 ? 'out' : 'in',
    fraction: Math.min(1, magnitude / Math.max(1, cap)),
    capped: magnitude > cap,
  }
}

export const railBars = (entries: RailEntry[]): RailBar[] => {
  const cap = railCap(entries)
  return entries.map((entry) => railBar(entry, cap))
}
