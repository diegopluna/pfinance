import { useEffect, type JSX } from 'react'
import { useColorScheme, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { chartPalette } from '@/charts/palette'
import type { RailBar } from '@/charts/rail'
import { timing } from '@/motion'

// The rail, drawn (the geometry and its reasoning live in charts/rail.ts).
// Each row carries its own 72px measurement column: a faint full-length
// track shows the scale's extent, a hairline marks the zero axis at its
// centre, and the row's bar leaves the axis — money out runs left in the
// expense orange, money in runs right in the slot-1 blue, the CVD-validated
// opposition the charts already use (docs/design/DECISIONS.md), never green
// and red. A bar that runs to the 75th-percentile cap ends square; a
// rounded end means the amount fit inside the frame. A Transfer leg or
// Balance Adjustment draws its neutral mark ON the axis, never off it.

const COLUMN_WIDTH = 72
const BAND_HEIGHT = 6
const RADIUS = BAND_HEIGHT / 2

// Ease out (docs/design/MOTION.md): a bar leaves the rule at speed and
// settles at its length, rather than winding up and coasting in.
const DRAW = timing(380)
const STAGGER_MS = 35

export function MagBar({
  bar,
  /** Stagger position, so a short list draws in as one gesture. */
  index = 0,
  animate = false,
  /** 'secondary' on the page background; 'background' on a tinted plate. */
  track = 'secondary',
}: {
  bar: RailBar
  index?: number
  animate?: boolean
  track?: 'secondary' | 'background'
}): JSX.Element {
  const palette = chartPalette(useColorScheme())
  const reduceMotion = useReducedMotion()
  const drawn = animate && !reduceMotion
  const progress = useSharedValue(drawn ? 0 : 1)
  useEffect(() => {
    progress.value = drawn ? withDelay(index * STAGGER_MS, withTiming(1, DRAW)) : 1
  }, [drawn, index, progress])

  // Half the column is the whole side; the animated width draws toward it.
  const style = useAnimatedStyle(() => ({
    width: (bar.fraction * COLUMN_WIDTH * progress.value) / 2,
  }))

  const trackClass = track === 'background' ? 'bg-background' : 'bg-surface-secondary'

  return (
    <View
      pointerEvents="none"
      style={{ width: COLUMN_WIDTH, height: BAND_HEIGHT }}
      className="relative"
    >
      <View className={`absolute inset-0 ${trackClass}`} style={{ borderRadius: RADIUS }} />
      {/* The axis passes a hair beyond the track so it reads as a rule the
          track sits on, not a seam inside it. */}
      <View
        className="absolute w-px bg-muted opacity-25"
        style={{ left: COLUMN_WIDTH / 2, top: -3, bottom: -3 }}
      />
      {bar.side === 'none' ? (
        <View
          className="absolute"
          style={{
            left: COLUMN_WIDTH / 2 - 4,
            width: 8,
            height: BAND_HEIGHT,
            borderRadius: RADIUS,
            backgroundColor: palette.uncategorized,
          }}
        />
      ) : (
        <Animated.View
          style={[
            {
              position: 'absolute',
              height: BAND_HEIGHT,
              backgroundColor: bar.side === 'out' ? palette.expense : palette.income,
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
            },
            style,
          ]}
        />
      )}
    </View>
  )
}
