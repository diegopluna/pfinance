import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import type { InferResponseType } from 'hono/client'
import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@pfinance/ui/components/chart'
import { api } from '@/lib/api'
import { compactAmount } from '@/lib/format'
import { monthLabel } from '@/lib/month'

// The monthly Net Worth line (issue #17), drawn with the shared shadcn chart
// primitives over recharts. The series arrives server-derived — this
// component only draws it. One series, so no legend: the section title names
// the line, and the current value rides the header next to it.

// Inferred from the RPC schema (the AccountEntry pattern) so the point shape
// can never drift from what the server sends.
type NetWorthPoint = InferResponseType<(typeof api.api)['net-worth']['$get'], 200>['series'][number]

// ChartContainer scopes --color-netWorth per theme. Light rides the theme's
// --chart-1; that token's dark value misses 3:1 contrast on the dark surface
// (2.9:1), so dark mode selects a lighter step of the same hue — validated
// against oklch(0.145 0 0).
const chartConfig = {
  netWorth: {
    label: 'Net worth',
    theme: { light: 'var(--chart-1)', dark: 'oklch(0.58 0.2 264.376)' },
  },
} satisfies ChartConfig

export function NetWorthChart({
  series,
  currency,
}: {
  series: NetWorthPoint[]
  currency: CurrencyCode
}) {
  return (
    <div>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-64 w-full [&_.recharts-cartesian-axis-tick_text]:tabular-nums"
      >
        {/* accessibilityLayer: arrow keys walk the months with the same
            tooltip the pointer gets. */}
        <LineChart
          data={series}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(month: string) => monthLabel(month, 'tick')}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tickMargin={8}
          />
          <YAxis
            // Net worth is not a quantity growing from zero — a household
            // deep in a mortgage lives below it — so the domain follows the
            // data instead of forcing a zero baseline.
            domain={['auto', 'auto']}
            tickFormatter={(value: number) => compactAmount(value, currency)}
            tickLine={false}
            axisLine={false}
            width={70}
          />
          {/* The crosshair cursor snaps to the nearest month, so nobody aims
              at a 2px line; ChartContainer keeps it hairline-recessive. */}
          <ChartTooltip
            isAnimationActive={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_, items) => {
                  const month = (items[0]?.payload as NetWorthPoint | undefined)?.month
                  return month === undefined ? null : monthLabel(month, 'full')
                }}
                // The default row renders raw minor units; this one formats
                // the exact amount, keyed by a short line stroke — a line
                // series' identity mark, not a box.
                formatter={(value) => (
                  <>
                    <div className="h-0.5 w-3 self-center rounded-full bg-(--color-netWorth)" />
                    <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                      <span className="text-muted-foreground">Net worth</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {formatAmount(Number(value), currency)}
                      </span>
                    </div>
                  </>
                )}
              />
            }
          />
          <Line
            type="monotone"
            dataKey="netWorth"
            stroke="var(--color-netWorth)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            // Only the endpoint is marked — an 8px dot ringed in the card
            // surface — so today's position reads without labeling every
            // month.
            dot={({ key, index, cx, cy }) =>
              index === series.length - 1 && cx !== undefined && cy !== undefined ? (
                <circle
                  key={key}
                  cx={cx}
                  cy={cy}
                  r={4}
                  fill="var(--color-netWorth)"
                  stroke="var(--color-card)"
                  strokeWidth={2}
                />
              ) : (
                <g key={key} />
              )
            }
            activeDot={{ r: 4, stroke: 'var(--color-card)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
      {/* Every value the tooltip shows, reachable without a pointer. */}
      <table className="sr-only">
        <caption>Net worth by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Net worth</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.month}>
              <td>{monthLabel(point.month, 'full')}</td>
              <td>{formatAmount(point.netWorth, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
