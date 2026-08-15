import { useState, type JSX, type ReactNode } from 'react'
import { Pressable, type PressableProps } from 'react-native'

// Press feedback for everything that isn't a heroui Button. React Native's
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
// The change is instant rather than eased. A press is the highest-frequency
// interaction in the app, and an animation that plays on every tap of every
// row spends attention it can't earn back — the same reason only the home
// screen's rail animates at all. Instant also means uninterruptible by
// construction: there is no ramp for a second tap to fight.

const PRESSED = {
  scale: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  dim: { opacity: 0.55 },
} as const

export function Touchable({
  feedback = 'scale',
  className,
  children,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  feedback?: 'scale' | 'dim'
  className?: string
  children: ReactNode
}): JSX.Element {
  const [held, setHeld] = useState(false)
  return (
    <Pressable
      {...props}
      className={className}
      style={held ? PRESSED[feedback] : undefined}
      onPressIn={(event) => {
        setHeld(true)
        props.onPressIn?.(event)
      }}
      onPressOut={(event) => {
        setHeld(false)
        props.onPressOut?.(event)
      }}
    >
      {children}
    </Pressable>
  )
}
