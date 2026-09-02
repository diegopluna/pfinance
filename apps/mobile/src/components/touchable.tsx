import type { JSX, ReactNode } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { duration, timing } from '@/motion'

// Press feedback for everything that isn't a Button. React Native's
// Pressable — unlike TouchableOpacity — has no default feedback at all, so
// a bare one is dead to the touch: you tap a ledger row and nothing
// acknowledges it until the form has already replaced the screen.
//
// Two modes, because a row and a control want different things:
//   'scale' — a control. 0.96, the tactile amount; smaller reads as a
//             flinch. It dims too, because 4% of a 36px icon button is not
//             enough to notice on its own.
//   'dim'   — a row. Shrinking a full-width list row bends the whole
//             layout around it; dropping it back is the honest
//             acknowledgement.
//
// The press lands within a frame — 90ms in, which is the first frame or
// two of the touch — and the release is what eases (docs/design/MOTION.md).
// Timing rather than a spring, and short enough that a second tap never
// fights a ramp; the system's reduced-motion setting makes both instant.

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export function Touchable({
  feedback = 'scale',
  className,
  style,
  children,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  feedback?: 'scale' | 'dim'
  className?: string
  /** Static style — a plate's lift, say — under the press animation. */
  style?: StyleProp<ViewStyle>
  children: ReactNode
}): JSX.Element {
  const pressed = useSharedValue(0)
  const animated = useAnimatedStyle(() =>
    feedback === 'scale'
      ? { opacity: 1 - 0.3 * pressed.value, transform: [{ scale: 1 - 0.04 * pressed.value }] }
      : { opacity: 1 - 0.45 * pressed.value },
  )
  return (
    <AnimatedPressable
      {...props}
      className={className}
      style={[style, animated]}
      onPressIn={(event) => {
        pressed.value = withTiming(1, timing(duration.pressIn))
        props.onPressIn?.(event)
      }}
      onPressOut={(event) => {
        pressed.value = withTiming(0, timing(duration.pressOut))
        props.onPressOut?.(event)
      }}
    >
      {children}
    </AnimatedPressable>
  )
}
