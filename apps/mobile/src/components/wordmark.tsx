import type { JSX } from 'react'
import { useColorScheme, Text, View } from 'react-native'
import { chartPalette } from '@/charts/palette'
import { RULE } from '@/components/rail'

// The mark is the rail in miniature: the product's name over one rule's
// worth of money out and money in. It appears only where the app introduces
// itself — the connect flow and sign-in — and nowhere a household is
// already signed in and looking at its own numbers.
export function Wordmark(): JSX.Element {
  const palette = chartPalette(useColorScheme())
  return (
    <View className="gap-2">
      <Text
        className="font-mono-medium text-[15px] text-foreground lowercase"
        style={{ letterSpacing: 0.5 }}
      >
        pfinance
      </Text>
      <View className="h-[3px] w-24 flex-row">
        <View style={{ width: `${RULE.symmetric * 100}%`, backgroundColor: palette.expense }} />
        <View className="flex-1" style={{ backgroundColor: palette.income }} />
      </View>
    </View>
  )
}
