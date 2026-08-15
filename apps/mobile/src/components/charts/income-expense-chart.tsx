import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import type { JSX } from 'react'
import { useColorScheme, View } from 'react-native'
import { monthLabel } from '@/charts/months'
import { chartPalette } from '@/charts/palette'
import { railBars, type RailBar } from '@/charts/rail'
import { Eyebrow } from '@/components/type'

// Income vs Expense per month (issue #79) as the rail, one row per month:
// expense left of the rule, income right, on one scale across the whole
// window. It is the mobile cut of the web card's paired vertical bars
// (apps/web/src/components/income-vs-expense-chart.tsx), turned on its side
// for the frame it actually has — a phone is tall and narrow, month labels
// need horizontal room, and there is no hover to recover a value from a
// column too thin to label.
//
// Read down the rule and the answer to "are we saving anything" is which
// side is longer, month after month. Both series exclude Transfers and
// Balance Adjustments by definition; the screen says so in words.
//
// The rule is a real column in the row rather than an overlay, so stacked
// rows form one continuous line without any shared-percentage arithmetic —
// and the month labels get a column the bars can never run into.

const BAR_HEIGHT = 8
// The starting width of the month column, not its cap: it fits a
// letterspaced "AUG 2026" at the default text size, and grows from there
// rather than truncating. Truncating would drop the year at exactly the
// boundary where the year is the point, and it is the OS text-size setting
// that decides how much room the label actually needs.
const LABEL_MIN_WIDTH = 72

export function IncomeExpenseChart({
  months,
  currency,
}: {
  months: { month: string; income: number; expense: number }[]
  currency: CurrencyCode
}): JSX.Element {
  const palette = chartPalette(useColorScheme())
  // Income and expense arrive as magnitudes from the server's derived
  // views; the rail re-signs them so both sides share one cap.
  const bars = railBars(
    months.flatMap((month) => [
      { amount: -month.expense, neutral: false },
      { amount: month.income, neutral: false },
    ]),
  )

  return (
    <View className="gap-3">
      <View accessibilityRole="list">
        {months.map((month, index) => {
          const out = bars[index * 2]
          const inbound = bars[index * 2 + 1]
          if (out === undefined || inbound === undefined) return null
          return (
            <View
              key={month.month}
              // A row of two bars is nothing to a screen reader without its
              // amounts, and `accessible` is what makes the label replace
              // the month label instead of being dropped beside it.
              accessible
              className="flex-row items-center py-1.5"
              accessibilityLabel={`${monthLabel(month.month, 'full')}: income ${formatAmount(month.income, currency)}, expense ${formatAmount(month.expense, currency)}`}
            >
              <View style={{ minWidth: LABEL_MIN_WIDTH }}>
                <Eyebrow>{monthLabel(month.month, 'tick')}</Eyebrow>
              </View>
              <View className="flex-1 flex-row justify-end">
                <Bar bar={out} color={palette.expense} side="out" />
              </View>
              <View className="w-px self-stretch bg-muted" style={{ opacity: 0.25 }} />
              <View className="flex-1 flex-row">
                <Bar bar={inbound} color={palette.income} side="in" />
              </View>
            </View>
          )
        })}
      </View>
      {/* Two series means the legend is always present, and identity never
          rides on color alone. */}
      <View className="flex-row justify-center gap-5">
        <LegendItem color={palette.expense} label="Expense" />
        <LegendItem color={palette.income} label="Income" />
      </View>
    </View>
  )
}

function Bar({
  bar,
  color,
  side,
}: {
  bar: RailBar
  color: string
  side: 'out' | 'in'
}): JSX.Element {
  // A capped bar ends square: the shape says the amount ran past the frame
  // rather than landing on its edge.
  const radius = bar.capped ? 0 : BAR_HEIGHT / 2
  return (
    <View
      style={{
        width: `${bar.fraction * 100}%`,
        height: BAR_HEIGHT,
        backgroundColor: color,
        ...(side === 'out'
          ? { borderTopLeftRadius: radius, borderBottomLeftRadius: radius }
          : { borderTopRightRadius: radius, borderBottomRightRadius: radius }),
      }}
    />
  )
}

function LegendItem({ color, label }: { color: string; label: string }): JSX.Element {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <Eyebrow>{label}</Eyebrow>
    </View>
  )
}
