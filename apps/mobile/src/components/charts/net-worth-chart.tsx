import { compactAmount, type CurrencyCode } from '@pfinance/currency'
import { useThemeColor } from 'heroui-native'
import { useState, type JSX } from 'react'
import { useColorScheme, View } from 'react-native'
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg'
import { CHART_LABEL_FONT } from '@/charts/font'
import { lineLayout, monthLabelAnchor, monthTickIndices } from '@/charts/layout'
import { monthLabel } from '@/charts/months'
import { chartPalette } from '@/charts/palette'

// The monthly Net Worth area (issue #79), drawn natively from the
// server-derived series (issue #17): slot-1 line over the low-alpha area
// fill, straight segments, only the endpoint marked — the mobile cut of the
// web's recharts hero (apps/web/src/components/net-worth-chart.tsx). All
// geometry comes from charts/layout.ts; this component only draws. Exact
// amounts live in the screen's headline — the chart is the shape, its axis
// ticks compact by design.
//
// Zero, when the domain contains it, is drawn as the rail's rule rather
// than as one more gridline: it is the same line every list on every other
// screen measures against, and a household below it should be able to see
// that at a glance.

const CHART_HEIGHT = 200
const LABEL_BAND = 18
const MAX_MONTH_LABELS = 4
// Breathing room so the endpoint dot and its ring never clip on the frame.
const RIGHT_INSET = 8

export function NetWorthChart({
  series,
  currency,
}: {
  series: { month: string; netWorth: number }[]
  currency: CurrencyCode
}): JSX.Element {
  const [width, setWidth] = useState(0)
  const palette = chartPalette(useColorScheme())
  // The dot's ring is the screen background — the web ringed it in the card
  // surface it sat on; here the chart sits directly on the screen.
  const [separator, muted, background] = useThemeColor(['separator', 'muted', 'background'])

  const layout =
    width === 0
      ? null
      : lineLayout(
          series.map((point) => point.netWorth),
          { width: width - RIGHT_INSET, height: CHART_HEIGHT },
        )
  const endpoint = layout?.points.at(-1)
  const labelIndices = monthTickIndices(series.length, MAX_MONTH_LABELS)

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Net worth by month, ${series.length} months`}
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
              stroke={tick.value === 0 ? muted : separator}
              strokeWidth={1}
              opacity={tick.value === 0 ? 0.5 : 1}
            />
          ))}
          {layout.ticks.map((tick) => (
            <SvgText
              key={`label-${tick.value}`}
              x={0}
              // Labels sit above their gridline; the top tick's sits below
              // it instead — above would clip on the frame edge.
              y={tick.y < 12 ? tick.y + 12 : tick.y - 4}
              fontSize={10}
              fontFamily={CHART_LABEL_FONT}
              fill={muted}
            >
              {compactAmount(tick.value, currency)}
            </SvgText>
          ))}
          <Path d={layout.areaPath} fill={palette.area} />
          <Path
            d={layout.linePath}
            stroke={palette.netWorth}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {endpoint !== undefined && (
            <Circle
              cx={endpoint.x}
              cy={endpoint.y}
              r={4}
              fill={palette.netWorth}
              stroke={background}
              strokeWidth={2}
            />
          )}
          {labelIndices.map((index) => {
            const point = layout.points[index]
            const month = series[index]?.month
            if (point === undefined || month === undefined) return null
            return (
              <SvgText
                key={month}
                x={point.x}
                y={CHART_HEIGHT + LABEL_BAND - 4}
                fontSize={10}
                fontFamily={CHART_LABEL_FONT}
                fill={muted}
                textAnchor={monthLabelAnchor(point.x, width)}
              >
                {monthLabel(month, 'tick')}
              </SvgText>
            )
          })}
        </Svg>
      )}
    </View>
  )
}
