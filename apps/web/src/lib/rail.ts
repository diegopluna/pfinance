// The rail: the product's one measurement device, mirrored from
// apps/mobile/src/charts/rail.ts — the two clients must scale a bar the
// same way; promote to a shared package when a third caller appears.
// Every signed quantity hangs off a shared zero axis: money out runs left
// of it, money in runs right. Direction is the sign, never the kind (ADR
// 0001); a Transfer leg or Balance Adjustment draws no bar, just its mark
// on the axis. Pure geometry, free of DOM imports, so the workspace's node
// test runner covers it.

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
