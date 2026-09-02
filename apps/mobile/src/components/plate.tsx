import type { ComponentProps, JSX } from 'react'
import { useColorScheme, View, type ViewProps, type ViewStyle } from 'react-native'
import { Touchable } from '@/components/touchable'

// A plate (docs/design/LOOK.md): a white surface LIFTED off the off-white
// ground rather than a grey fill sunk into a white one. The edge is Emil
// Kowalski's recipe — a hairline drawn as a 6% ring plus four shadows that
// each halve — so the plate has depth without a border. In the dark a
// surface is told apart by its edge alone.
//
// The class carries the shape and fill; the style carries the shadow,
// because React Native's boxShadow takes the whole list as one string.

const PLATE = 'rounded-xl bg-surface'

const LIFT =
  '0 0 0 1px rgba(0,0,0,0.06), 0 1px 0 0 rgba(0,0,0,0.08), 0 2px 2px 0 rgba(0,0,0,0.04), 0 3px 3px 0 rgba(0,0,0,0.02), 0 4px 4px 0 rgba(0,0,0,0.01)'
const EDGE = '0 0 0 1px rgba(255,255,255,0.08)'

// The highlight a dark control wears along its top edge, and the lift a
// light one sits on — the two faces of the same depth.
export function useControlDepth(kind: 'dark' | 'light'): ViewStyle {
  const scheme = useColorScheme()
  if (kind === 'dark') {
    return {
      boxShadow:
        scheme === 'dark'
          ? 'inset 0 -1px 0 0 rgba(0,0,0,0.06)'
          : 'inset 0 1px 0 0 rgba(255,255,255,0.14), 0 1px 1.5px 0 rgba(0,0,0,0.32)',
    }
  }
  return { boxShadow: scheme === 'dark' ? EDGE : LIFT }
}

/** A plate that is only looked at. */
export function Plate({
  className = '',
  style,
  ...props
}: ViewProps & { className?: string }): JSX.Element {
  const lift = useControlDepth('light')
  return <View className={`${PLATE} ${className}`} style={[lift, style]} {...props} />
}

/** A plate that is a doorway — the soft actionable row. */
export function PlateTouchable({
  className = '',
  style,
  ...props
}: ComponentProps<typeof Touchable>): JSX.Element {
  const lift = useControlDepth('light')
  return <Touchable className={`${PLATE} ${className}`} style={[lift, style]} {...props} />
}
