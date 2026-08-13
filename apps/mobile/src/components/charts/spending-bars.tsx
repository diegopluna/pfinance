import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import { Typography } from 'heroui-native'
import type { JSX } from 'react'
import { useColorScheme, View } from 'react-native'
import { chartPalette } from '@/charts/palette'
import { spendingRows, type SpendingSliceInput } from '@/charts/spending'
import { Amount } from '@/components/amount'

// Spending by Category for one month (issue #79), drawn natively as
// horizontal bars — the form for comparing magnitudes across labeled
// categories, the mobile cut of the web chart (apps/web/src/components/
// spending-by-category-chart.tsx). Plain Views, no SVG: a fraction-wide bar
// under each label row scales with the screen on its own. Rows arrive
// server-summed and largest-first (charts/spending.ts adds only
// presentation); every row carries its exact amount through the shared
// currency package (ADR 0006), so nothing here is compact-only.

export function SpendingBars({
  slices,
  currency,
}: {
  slices: SpendingSliceInput[]
  currency: CurrencyCode
}): JSX.Element {
  const palette = chartPalette(useColorScheme())
  return (
    <View accessibilityRole="list">
      {spendingRows(slices).map((row) => (
        <View key={row.key} className="gap-1.5 py-2">
          <View className="flex-row items-center justify-between gap-3">
            <Typography.Paragraph numberOfLines={1} className="shrink font-medium">
              {row.label}
            </Typography.Paragraph>
            <Amount amount={{ text: formatAmount(row.total, currency), tone: 'plain' }} />
          </View>
          <View className="h-2 overflow-hidden rounded-full bg-surface-secondary">
            <View
              className="h-2 rounded-full"
              style={{
                width: `${row.fraction * 100}%`,
                backgroundColor:
                  row.slot === 'uncategorized'
                    ? palette.uncategorized
                    : // The modulo is spendingRows' contract; the fallback
                      // only convinces the index check.
                      (palette.slots[row.slot] ?? palette.uncategorized),
              }}
            />
          </View>
        </View>
      ))}
    </View>
  )
}
