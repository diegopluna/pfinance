import { useThemeColor, Typography } from 'heroui-native'
import { useState, type JSX } from 'react'
import { useColorScheme, View } from 'react-native'
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg'
import {
  monthLabelAnchor,
  monthTickIndices,
  pairedBarsLayout,
  topRoundedBarPath,
} from '@/charts/layout'
import { monthLabel } from '@/charts/months'
import { chartPalette } from '@/charts/palette'

// Income vs Expense per month (issue #79), drawn natively as paired
// vertical bars from the server-summed window (issue #19) — the mobile cut
// of the web chart (apps/web/src/components/income-vs-expense-chart.tsx):
// the slot 1 / slot 2 CVD-validated opposition, bars rounded at the data
// end, square on the baseline. Two series means the legend is always
// present, and identity never rides on color alone. All geometry comes from
// charts/layout.ts; this component only draws. No value axis, the web
// card's stance — magnitudes read from the pairing, exact amounts from the
// screen's latest-month line.

const CHART_HEIGHT = 176
const LABEL_BAND = 18
const MAX_MONTH_LABELS = 4
const BAR_RADIUS = 4

export function IncomeExpenseChart({
  months,
}: {
  months: { month: string; income: number; expense: number }[]
}): JSX.Element {
  const [width, setWidth] = useState(0)
  const palette = chartPalette(useColorScheme())
  const [separator, muted] = useThemeColor(['separator', 'muted'])

  const layout =
    width === 0
      ? null
      : pairedBarsLayout(
          months.map((point) => ({ income: point.income, expense: point.expense })),
          { width, height: CHART_HEIGHT },
        )
  const labelIndices = monthTickIndices(months.length, MAX_MONTH_LABELS)

  return (
    <View className="gap-3">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Income versus expense by month, ${months.length} months`}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        {layout !== null && (
          <Svg width={width} height={CHART_HEIGHT + LABEL_BAND}>
            {layout.ticks.map((tick) => (
              <Line
                key={tick.value}
                x1={0}
                y1={tick.y}
                x2={width}
                y2={tick.y}
                stroke={separator}
                strokeWidth={1}
              />
            ))}
            {layout.bars.map((bar, index) => {
              const month = months[index]?.month ?? String(index)
              return [
                <Path
                  key={`${month}-income`}
                  d={topRoundedBarPath(bar.income, BAR_RADIUS)}
                  fill={palette.income}
                />,
                <Path
                  key={`${month}-expense`}
                  d={topRoundedBarPath(bar.expense, BAR_RADIUS)}
                  fill={palette.expense}
                />,
              ]
            })}
            {labelIndices.map((index) => {
              const bar = layout.bars[index]
              const month = months[index]?.month
              if (bar === undefined || month === undefined) return null
              return (
                <SvgText
                  key={month}
                  x={bar.x}
                  y={CHART_HEIGHT + LABEL_BAND - 4}
                  fontSize={10}
                  fill={muted}
                  textAnchor={monthLabelAnchor(bar.x, width)}
                >
                  {monthLabel(month, 'tick')}
                </SvgText>
              )
            })}
          </Svg>
        )}
      </View>
      {/* The legend: identity never rides on color alone, so both swatches
          sit beside their names. */}
      <View className="flex-row justify-center gap-5">
        <LegendItem color={palette.income} label="Income" />
        <LegendItem color={palette.expense} label="Expense" />
      </View>
    </View>
  )
}

function LegendItem({ color, label }: { color: string; label: string }): JSX.Element {
  return (
    <View className="flex-row items-center gap-1.5">
      <View className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      <Typography.Paragraph type="body-sm" color="muted">
        {label}
      </Typography.Paragraph>
    </View>
  )
}
