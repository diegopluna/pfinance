import { useState, type JSX } from 'react'
import { useColorScheme, View } from 'react-native'
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg'
import { lineLayout } from '@/charts/layout'
import type { NetWorthPoint } from '@/charts/net-worth'
import { chartPalette } from '@/charts/palette'

// The net-worth trend as atmosphere: the home screen's full-bleed area
// wash under the hero — the same series the Net Worth dashboard charts,
// with no axes, no ticks and no labels. It is deliberately unreadable as a
// chart and honest as a shape: the geometry is charts/layout.ts's
// lineLayout, the exact one the labeled chart draws, so the wash can never
// tell a different story than the dashboard behind its tap. The color is
// the palette's netWorth slot in both directions — a data color, not a
// mood ring; a down month is not painted red.

const HEIGHT = 120
const DOT_INSET = 4

export function TrendWash({ series }: { series: NetWorthPoint[] }): JSX.Element | null {
  const palette = chartPalette(useColorScheme())
  const [width, setWidth] = useState(0)

  if (series.length < 2) return null

  const layout =
    width === 0
      ? null
      : // Inset so the endpoint dot never clips the frame it punctuates.
        lineLayout(
          series.map((point) => point.netWorth),
          { width: width - DOT_INSET, height: HEIGHT - DOT_INSET * 2 },
        )
  const last = layout?.points.at(-1)

  return (
    <View
      style={{ height: HEIGHT }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {layout !== null && width > 0 && (
        <Svg width={width} height={HEIGHT}>
          <G y={DOT_INSET}>
            <Defs>
              <LinearGradient id="trend-wash" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={palette.netWorth} stopOpacity={0.14} />
                <Stop offset="1" stopColor={palette.netWorth} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={layout.areaPath} fill="url(#trend-wash)" />
            <Path
              d={layout.linePath}
              stroke={palette.netWorth}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {last !== undefined && (
              <Circle cx={last.x} cy={last.y} r={3.5} fill={palette.netWorth} />
            )}
          </G>
        </Svg>
      )}
    </View>
  )
}
