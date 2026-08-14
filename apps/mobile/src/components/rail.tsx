import { useEffect, type JSX, type ReactNode } from 'react'
import { useColorScheme, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated'
import { chartPalette } from '@/charts/palette'
import type { RailBar } from '@/charts/rail'

// The rail, drawn (the geometry and its reasoning live in charts/rail.ts).
// A Rail lays a single faint zero rule down its full height; every RailBand
// inside it hangs its bar off that same rule, so a scrolling list reads
// against a fixed axis. Money out runs left in the expense orange, money in
// runs right in the slot-1 blue — the CVD-validated opposition the charts
// already use (docs/design/DECISIONS.md), never green and red.

/** Where the rule sits across the row, as a fraction of its width. */
export const RULE = {
  // A ledger is mostly outflows and they are the many small amounts worth
  // spreading out, so the rule sits right of center — which is also where
  // the gap between a description and its right-aligned amount falls.
  ledger: 0.62,
  // Income and expense per month are two aggregates of the same order:
  // an even split, or the shorter side lies about the comparison.
  symmetric: 0.5,
} as const

const BAND_HEIGHT = 3
// A bar never quite touches the frame: the gap is what makes a capped bar
// read as ending rather than as continuing off-screen.
const SIDE_INSET = 1.5

const DRAW: WithTimingConfig = { duration: 420 }
const STAGGER_MS = 45

export function Rail({
  rule = RULE.ledger,
  className,
  children,
}: {
  rule?: number
  className?: string
  children: ReactNode
}): JSX.Element {
  return (
    <View className={className}>
      <View
        pointerEvents="none"
        // Ruled-paper faint: it passes behind a row's text, so it has to read
        // as texture. The bars all leaving from the same x is what actually
        // carries the axis; the line only confirms where it is.
        className="absolute top-0 bottom-0 w-px bg-muted"
        style={{ left: `${rule * 100}%`, opacity: 0.2 }}
      />
      {children}
    </View>
  )
}

// One row's bar. It occupies the row's bottom edge rather than a column of
// its own: the row stays a readable line of text, and the chart is the
// underline it already had.
export function RailBand({
  bar,
  rule = RULE.ledger,
  index = 0,
  animate = false,
}: {
  bar: RailBar
  rule?: number
  /** Stagger position, so a short list draws in as one gesture. */
  index?: number
  animate?: boolean
}): JSX.Element {
  const palette = chartPalette(useColorScheme())
  const reduceMotion = useReducedMotion()
  const drawn = animate && !reduceMotion
  const progress = useSharedValue(drawn ? 0 : 1)
  useEffect(() => {
    progress.value = drawn ? withDelay(index * STAGGER_MS, withTiming(1, DRAW)) : 1
  }, [drawn, index, progress])

  const side = bar.side === 'out' ? rule * 100 : (1 - rule) * 100
  const full = Math.max(0, side - SIDE_INSET)
  const style = useAnimatedStyle(() => ({ width: `${bar.fraction * full * progress.value}%` }))

  if (bar.side === 'none') {
    // On the rule, not off it: a Transfer or Balance Adjustment moves the
    // Balance without being spending or income.
    return (
      <View
        pointerEvents="none"
        className="absolute right-0 bottom-0 left-0"
        style={{ height: BAND_HEIGHT }}
      >
        <View
          className="absolute"
          style={{
            left: `${rule * 100}%`,
            marginLeft: -4,
            width: 8,
            height: BAND_HEIGHT,
            borderRadius: BAND_HEIGHT / 2,
            backgroundColor: palette.uncategorized,
          }}
        />
      </View>
    )
  }

  const out = bar.side === 'out'
  // A capped bar ends square, an ordinary one ends round: the shape says
  // whether the amount fit in the frame or ran past it.
  const cap = bar.capped ? 0 : BAND_HEIGHT / 2
  return (
    <View
      pointerEvents="none"
      className="absolute right-0 bottom-0 left-0"
      style={{ height: BAND_HEIGHT }}
    >
      <Animated.View
        style={[
          {
            position: 'absolute',
            height: BAND_HEIGHT,
            backgroundColor: out ? palette.expense : palette.income,
            ...(out
              ? {
                  right: `${(1 - rule) * 100}%`,
                  borderTopLeftRadius: cap,
                  borderBottomLeftRadius: cap,
                }
              : {
                  left: `${rule * 100}%`,
                  borderTopRightRadius: cap,
                  borderBottomRightRadius: cap,
                }),
          },
          style,
        ]}
      />
    </View>
  )
}
