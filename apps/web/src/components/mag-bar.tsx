import type { RailBar } from '@/lib/rail'

// The rail, drawn (the geometry and its reasoning live in lib/rail.ts —
// the same device the mobile app draws in its rail.tsx). Each row carries
// an 88px measurement column: a faint full-length track shows the scale's
// extent, a hairline marks the zero axis at its centre, and the row's bar
// leaves the axis — money out runs left in the expense orange (--chart-2),
// money in runs right in the slot-1 blue (--chart-1), the CVD-validated
// opposition the charts already use (docs/design/DECISIONS.md), never
// green and red. A bar that runs to the 75th-percentile cap ends square; a
// rounded end means the amount fit inside the frame. A Transfer leg or
// Balance Adjustment draws its neutral mark ON the axis, never off it.

const COLUMN_WIDTH = 88
const BAND_HEIGHT = 6
const RADIUS = BAND_HEIGHT / 2

export function MagBar({
  bar,
  /** 'muted' on the page background; 'background' on a tinted plate. */
  track = 'muted',
}: {
  bar: RailBar
  track?: 'muted' | 'background'
}) {
  const half = (bar.fraction * COLUMN_WIDTH) / 2
  return (
    <div
      aria-hidden
      className="relative shrink-0"
      style={{ width: COLUMN_WIDTH, height: BAND_HEIGHT }}
    >
      <div
        className={`absolute inset-0 ${track === 'background' ? 'bg-background' : 'bg-muted'}`}
        style={{ borderRadius: RADIUS }}
      />
      {/* The axis passes a hair beyond the track so it reads as a rule the
          track sits on, not a seam inside it. */}
      <div
        className="absolute w-px bg-muted-foreground/25"
        style={{ left: COLUMN_WIDTH / 2, top: -3, bottom: -3 }}
      />
      {bar.side === 'none' ? (
        <div
          className="absolute bg-(--chart-uncategorized)"
          style={{
            left: COLUMN_WIDTH / 2 - 4,
            width: 8,
            height: BAND_HEIGHT,
            borderRadius: RADIUS,
          }}
        />
      ) : (
        <div
          className={bar.side === 'out' ? 'absolute bg-(--chart-2)' : 'absolute bg-(--chart-1)'}
          style={{
            height: BAND_HEIGHT,
            width: half,
            // A capped bar ends square: the shape says the amount ran to
            // the frame rather than fitting inside it.
            ...(bar.side === 'out'
              ? {
                  right: COLUMN_WIDTH / 2,
                  borderTopLeftRadius: bar.capped ? 0 : RADIUS,
                  borderBottomLeftRadius: bar.capped ? 0 : RADIUS,
                }
              : {
                  left: COLUMN_WIDTH / 2,
                  borderTopRightRadius: bar.capped ? 0 : RADIUS,
                  borderBottomRightRadius: bar.capped ? 0 : RADIUS,
                }),
          }}
        />
      )}
    </div>
  )
}
