import { useThemeColor } from 'heroui-native'
import type { JSX } from 'react'
import Svg, { Path } from 'react-native-svg'

// The app's only two glyphs. There is no icon dependency and no icon set:
// a chevron pointing back or pointing on, and a caret that carries the
// direction of a change. Both are drawn rather than typed — ▲ and ▼ are
// geometric-shapes codepoints a text face need not carry, and a missing
// glyph in the one place a fall is announced is not a risk worth taking.
// Anything else that needs a name gets a word instead.
// The rendered stroke every glyph in this file is drawn to: 1.5px, the
// weight that sits beside 400-weight body text.
const STROKE = 1.5
const VIEW_BOX = 24

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
        // The stroke is stated in viewBox units, so a fixed width renders
        // thinner the smaller the glyph is drawn — a 14px chevron came out
        // at 1.17px beside the same text an 18px one met at 1.5px. Solving
        // for the rendered weight keeps every chevron on the 1.5px that
        // matches regular body text, whatever size it is used at.
        strokeWidth={(STROKE * VIEW_BOX) / size}
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
