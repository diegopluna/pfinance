import { useThemeColor } from 'heroui-native'
import type { JSX } from 'react'
import Svg, { Circle, Path } from 'react-native-svg'
import { useControlDepth } from '@/components/plate'
import { Touchable } from '@/components/touchable'

// The header's action buttons, drawn as the circles iOS 26 gives native bar
// buttons: a 36px round control with one glyph. `prominent` is the tinted
// style for the screen's one primary verb; the plain variant is the quiet
// bordered sibling. When these screens adopt native-stack headers the
// system draws the Liquid Glass versions and this component retires —
// the shapes and sizes here are that target, approximated in-app.
// Drawn at 36px, touchable at 44 via hitSlop, as list-screen's back
// button already does.

const GLYPHS = {
  plus: <Path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="M15.8 15.8 21 21" />
    </>
  ),
} as const

export function IconButton({
  glyph,
  label,
  prominent = false,
  onPress,
}: {
  glyph: keyof typeof GLYPHS
  label: string
  prominent?: boolean
  onPress: () => void
}): JSX.Element {
  const [accentForeground, foreground] = useThemeColor(['accent-foreground', 'foreground'])
  // The prominent one is the foreground inverted with a highlight along
  // its top edge; the quiet one lifts like a plate (docs/design/LOOK.md).
  const depth = useControlDepth(prominent ? 'dark' : 'light')
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      className={`h-9 w-9 items-center justify-center rounded-full ${
        prominent ? 'bg-accent' : 'bg-surface'
      }`}
      style={depth}
    >
      <Svg
        width={glyph === 'plus' ? 18 : 16}
        height={glyph === 'plus' ? 18 : 16}
        viewBox="0 0 24 24"
        fill="none"
        stroke={prominent ? accentForeground : foreground}
        // Solved for the rendered weight, as components/chevron.tsx does:
        // the + draws at 2px, the search glyph at 1.8px, whatever size the
        // icon is placed at (strokeWidth is stated in viewBox units).
        strokeWidth={glyph === 'plus' ? (2 * 24) / 18 : (1.8 * 24) / 16}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPHS[glyph]}
      </Svg>
    </Touchable>
  )
}
