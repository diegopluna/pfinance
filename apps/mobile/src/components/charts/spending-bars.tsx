import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import type { JSX } from 'react'
import { useColorScheme, View } from 'react-native'
import { chartPalette } from '@/charts/palette'
import { spendingRows, type SpendingSliceInput } from '@/charts/spending'
import { Figure } from '@/components/amount'
import { Body } from '@/components/type'

// Spending by Category for one month (issue #79), drawn natively as
// horizontal bars — the form for comparing magnitudes across labeled
// categories, the mobile cut of the web chart (apps/web/src/components/
// spending-by-category-chart.tsx). Plain Views, no SVG: a fraction-wide bar
// under each label row scales with the screen on its own.
//
// These bars deliberately do not use the rail. The rail means a sign, and
// every slice here is spending — one direction, one sign, magnitudes only.
// Giving them a zero rule would claim a comparison the data doesn't make.
//
// Rows arrive server-summed and largest-first (charts/spending.ts adds only
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
        <View key={row.key} className="gap-2 py-2.5">
          <View className="flex-row items-baseline justify-between gap-3">
            <Body numberOfLines={1} className="shrink">
              {row.label}
            </Body>
            <Figure>{formatAmount(row.total, currency)}</Figure>
          </View>
          <View className="h-[6px] overflow-hidden rounded-full bg-surface-secondary">
            <View
              className="h-[6px] rounded-full"
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
