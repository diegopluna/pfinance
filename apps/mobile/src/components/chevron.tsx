import { useThemeColor } from 'heroui-native'
import type { JSX } from 'react'
import Svg, { Path } from 'react-native-svg'

// The app's only two glyphs. There is no icon dependency and no icon set:
// a chevron pointing back or pointing on, and a caret that carries the
// direction of a change. Both are drawn rather than typed — ▲ and ▼ are
// geometric-shapes codepoints a text face need not carry, and a missing
// glyph in the one place a fall is announced is not a risk worth taking.
// Anything else that needs a name gets a word instead.
export function Chevron({
  direction,
  size = 16,
  tone = 'muted',
}: {
  direction: 'left' | 'right'
  size?: number
  tone?: 'muted' | 'foreground'
}): JSX.Element {
  const [muted, foreground] = useThemeColor(['muted', 'foreground'])
  const d = direction === 'left' ? 'M15 4 L7 12 L15 20' : 'M9 4 L17 12 L9 20'
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={d}
        stroke={tone === 'muted' ? muted : foreground}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// A rise or a fall. Direction never rides on color alone: the caret points,
// the amount keeps its words, and the color only confirms them.
export function Caret({
  direction,
  color,
  size = 9,
}: {
  direction: 'up' | 'down'
  color: string
  size?: number
}): JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      <Path d={direction === 'up' ? 'M5 1 L10 9 L0 9 Z' : 'M5 9 L10 1 L0 1 Z'} fill={color} />
    </Svg>
  )
}
