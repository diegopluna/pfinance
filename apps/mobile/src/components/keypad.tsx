import { useThemeColor } from 'heroui-native'
import type { JSX } from 'react'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Figure } from '@/components/amount'
import { Touchable } from '@/components/touchable'

// The cash-register keypad, shared by the quick-add sheet (issue #80) and
// the adjust-balance sheet (issue #81) — the keypad IS the amount input
// (ledger/keypad.ts), so the system keyboard never fights it. The corner
// key is the one place the two differ: capture wants the 00 convenience,
// adjustment needs a sign — a liability's reality is negative — and the
// keys stay large enough to hit without looking (48px rows).

type Key = number | 'corner' | 'delete'

const KEY_ROWS: readonly (readonly Key[])[] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
  ['corner', 0, 'delete'],
]

export function Keypad({
  corner = 'double-zero',
  onDigit,
  onCorner,
  onDelete,
}: {
  /** The bottom-left key: '00' for capture, ± where sign is a fact. */
  corner?: 'double-zero' | 'sign'
  onDigit: (digit: number) => void
  onCorner: () => void
  onDelete: () => void
}): JSX.Element {
  const [foreground] = useThemeColor(['foreground'])
  const cornerLabel = corner === 'sign' ? 'Switch between positive and negative' : '00'
  return (
    <View className="gap-0.5">
      {KEY_ROWS.map((row) => (
        <View key={String(row)} className="flex-row gap-0.5">
          {row.map((key) => (
            <Touchable
              key={String(key)}
              feedback="dim"
              accessibilityRole="button"
              accessibilityLabel={
                key === 'delete'
                  ? 'Delete last digit'
                  : key === 'corner'
                    ? cornerLabel
                    : String(key)
              }
              onPress={() =>
                key === 'delete' ? onDelete() : key === 'corner' ? onCorner() : onDigit(key)
              }
              className="h-12 flex-1 items-center justify-center rounded-lg"
            >
              {key === 'delete' ? (
                <Glyph color={foreground}>
                  <Path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
                  <Path d="M18 9l-6 6M12 9l6 6" />
                </Glyph>
              ) : key === 'corner' && corner === 'sign' ? (
                <Glyph color={foreground}>
                  <Path d="M7 4.5v6M4 7.5h6" />
                  <Path d="M14 17.5h6" />
                </Glyph>
              ) : (
                <Figure size="lg" tone="plain">
                  {key === 'corner' ? '00' : String(key)}
                </Figure>
              )}
            </Touchable>
          ))}
        </View>
      ))}
    </View>
  )
}

function Glyph({ color, children }: { color: string; children: React.ReactNode }): JSX.Element {
  return (
    <Svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      // Solved for the rendered weight (components/chevron.tsx): 1.8px at
      // whatever size the glyph draws.
      strokeWidth={(1.8 * 24) / 22}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  )
}
