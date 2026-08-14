// Chart geometry for the mobile dashboards (issue #79): pure math from
// server-derived series to SVG coordinates, so the components only draw.
// The web renders these charts through recharts; native has no equivalent
// dependency, so the scales and paths live here — free of react-native
// imports, covered by the workspace's node test runner.

// A nice round gridline step from the 1/2/5 ladder.
const niceStep = (raw: number): number => {
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power
}

// Gridline values covering [min, max] in minor units. The domain follows
// the data instead of forcing a zero baseline — net worth lives below zero
// in a household deep in a mortgage (the web chart's stance); bar charts
// pass min 0 themselves. A flat series widens by a fixed 100 minor units
// per side — the scale is currency-blind, the pad only gives a single-month
// ledger a band to sit in.
export const valueTicks = (min: number, max: number, count = 4): number[] => {
  const lo = min === max ? min - 100 : min
  const hi = min === max ? max + 100 : max
  const step = niceStep((hi - lo) / (count - 1))
  const ticks: number[] = []
  for (let value = Math.floor(lo / step) * step; ; value += step) {
    ticks.push(value)
    if (value >= hi) return ticks
  }
}

export interface Frame {
  width: number
  height: number
}

// SVG y grows downward, so the first gridline sits on the frame's bottom
// edge and the last on its top. Coordinates round to 2 decimals to keep
// path strings short.
const round = (value: number) => Math.round(value * 100) / 100

const yScale = (ticks: number[], height: number) => {
  const floor = ticks[0] ?? 0
  const span = (ticks.at(-1) ?? 1) - floor || 1
  return (value: number) => round(height - ((value - floor) / span) * height)
}

export interface LineLayout {
  ticks: { value: number; y: number }[]
  points: { x: number; y: number }[]
  linePath: string
  areaPath: string
}

// The Net Worth series onto a frame: straight segments (no spline — the
// path must never overshoot a real value), with the area closing to the
// frame's bottom, the recharts baseline the web chart uses. A single-month
// series centers its lone point; the screen marks it with the endpoint dot.
export const lineLayout = (values: number[], frame: Frame): LineLayout => {
  const ticks = valueTicks(Math.min(...values), Math.max(...values))
  const y = yScale(ticks, frame.height)
  const points = values.map((value, index) => ({
    x: round(values.length === 1 ? frame.width / 2 : (index / (values.length - 1)) * frame.width),
    y: y(value),
  }))
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join('')
  const last = points.at(-1)
  const first = points[0]
  const areaPath =
    last === undefined || first === undefined
      ? ''
      : `${linePath}L${last.x} ${frame.height}L${first.x} ${frame.height}Z`
  return {
    ticks: ticks.map((value) => ({ value, y: y(value) })),
    points,
    linePath,
    areaPath,
  }
}

// A phone fits few axis labels, so months label a subset: stepping back
// from the latest month so the newest label always renders — the ledger's
// right edge is the month being asked about.
export const monthTickIndices = (count: number, maxLabels: number): number[] => {
  if (count === 0) return []
  const step = Math.ceil(count / maxLabels)
  const indices: number[] = []
  for (let index = count - 1; index >= 0; index -= step) {
    indices.unshift(index)
  }
  return indices.slice(-maxLabels)
}

// A month label near either frame edge anchors inward so it never clips —
// one rule for both time-series charts. The margins approximate a rendered
// "Aug 2026" at the axis font size.
export const monthLabelAnchor = (x: number, width: number): 'start' | 'middle' | 'end' =>
  x < 32 ? 'start' : x > width - 40 ? 'end' : 'middle'

export interface BarRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PairedBarsLayout {
  ticks: { value: number; y: number }[]
  bars: { x: number; income: BarRect; expense: BarRect }[]
}

// The web bars round at the data end and stay square on the baseline
// (radius [4,4,0,0]); a plain Rect rounds all four corners, so the bar is a
// path — quadratic corners, radius clamped to the bar's own size. A
// zero-height bar draws nothing rather than a stray hairline.
export const topRoundedBarPath = (rect: BarRect, radius: number): string => {
  if (rect.height <= 0) return ''
  const r = round(Math.min(radius, rect.height, rect.width / 2))
  const { x, y, width, height } = rect
  const bottom = round(y + height)
  return (
    `M${x} ${bottom}V${round(y + r)}Q${x} ${y} ${round(x + r)} ${y}` +
    `H${round(x + width - r)}Q${round(x + width)} ${y} ${round(x + width)} ${round(y + r)}` +
    `V${bottom}Z`
  )
}

// The web pairing: a fixed 12px cap so short windows don't balloon into
// slabs, thinning only when a month's band can't fit the pair.
const BAR_WIDTH = 12
const BAR_GAP = 2

// Income and expense are magnitudes (the server already resolved the sign
// into the view), so bars grow from a zero baseline; each month owns an
// equal band with income left of center, expense right. A quiet side keeps
// its zero-height entry — the pair never collapses into a lone bar. An
// all-zero window (possible when the ledger's only entries sit outside it)
// falls back to a one-major-unit axis rather than dividing by zero.
export const pairedBarsLayout = (
  months: { income: number; expense: number }[],
  frame: Frame,
): PairedBarsLayout => {
  const max = Math.max(0, ...months.map((month) => Math.max(month.income, month.expense)))
  const ticks = valueTicks(0, max === 0 ? 100 : max, 3)
  const y = yScale(ticks, frame.height)
  const band = frame.width / Math.max(1, months.length)
  const barWidth = round(Math.min(BAR_WIDTH, band * 0.35))
  const rect = (center: number, side: 'income' | 'expense', value: number): BarRect => ({
    x: round(side === 'income' ? center - BAR_GAP / 2 - barWidth : center + BAR_GAP / 2),
    y: y(value),
    width: barWidth,
    height: round(frame.height - y(value)),
  })
  return {
    ticks: ticks.map((value) => ({ value, y: y(value) })),
    bars: months.map((month, index) => {
      const center = round(band * index + band / 2)
      return {
        x: center,
        income: rect(center, 'income', month.income),
        expense: rect(center, 'expense', month.expense),
      }
    }),
  }
}
