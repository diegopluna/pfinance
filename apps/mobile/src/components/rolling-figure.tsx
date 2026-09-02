import { useEffect, useRef, type JSX } from 'react'
import { View } from 'react-native'
import Animated, { Keyframe, ReduceMotion } from 'react-native-reanimated'
import { useFigureStyle, type FigureSize, type FigureTone } from '@/components/amount'
import { duration, ease } from '@/motion'
import { rollSlots } from '@/ledger/roll'

// A figure whose digits roll (docs/design/MOTION.md): the keypad amount is
// the biggest number on screen and the only one a person changes with their
// own hands, so it moves like an odometer instead of blinking to its next
// value. Each glyph is keyed by its position from the right AND its
// character (ledger/roll.ts), so only the glyphs that actually changed
// remount — and a remount is what plays the entrance: up from below as the
// value grows, down from above as it shrinks. The old glyph simply leaves;
// an exit animation would hold its width and jitter the row.
//
// Nothing rolls on first paint: the sheet is already arriving.

const ROLL = 10

const rollUp = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: ROLL }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: ease.out },
})
  .duration(duration.digits)
  .reduceMotion(ReduceMotion.System)

const rollDown = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -ROLL }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: ease.out },
})
  .duration(duration.digits)
  .reduceMotion(ReduceMotion.System)

export function RollingFigure({
  text,
  value,
  size = 'hero',
  tone = 'plain',
}: {
  /** The formatted amount. */
  text: string
  /** The amount itself, for the direction the digits roll. */
  value: number
  size?: FigureSize
  tone?: FigureTone
}): JSX.Element {
  const dress = useFigureStyle(size, tone)
  const previous = useRef<number | null>(null)
  const entering =
    previous.current === null ? undefined : value >= previous.current ? rollUp : rollDown
  useEffect(() => {
    previous.current = value
  }, [value])

  return (
    // One accessible node reading the whole amount; the glyphs are drawing.
    <View className="flex-row" accessible accessibilityRole="text" accessibilityLabel={text}>
      {rollSlots(text).map((slot) => (
        <Animated.Text
          key={slot.key}
          entering={entering}
          className={dress.className}
          style={dress.style}
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          {slot.char}
        </Animated.Text>
      ))}
    </View>
  )
}
