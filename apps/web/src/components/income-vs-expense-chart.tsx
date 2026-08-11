import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import type { InferResponseType } from 'hono/client'
import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@pfinance/ui/components/chart'
import { api } from '@/lib/api'
import { monthLabel } from '@/lib/month'

// Income vs Expense per month (issue #19), drawn as paired vertical bars —
// the form for comparing two magnitudes side by side over time. The months
// arrive server-summed with gaps zero-filled; this component only draws
// them. Two series means a legend is always present, and identity never
// rides on color alone.

// Inferred from the RPC schema (the AccountEntry pattern) so the point shape
// can never drift from what the server sends.
type IncomeExpensePoint = InferResponseType<
  (typeof api.api)['income-vs-expense']['$get'],
  200
>['months'][number]

// The pair is polarity — money in against money out — and the 1b prototype
// draws it as slot 1 (blue) against slot 2 (orange): the CVD-validated
// opposition from docs/design/DECISIONS.md. Both tokens are theme-aware in
// globals.css, so no per-chart dark override exists here.
const chartConfig = {
  income: {
    label: 'Income',
    color: 'var(--chart-1)',
  },
  expense: {
    label: 'Expense',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

export function IncomeVsExpenseChart({
  months,
  currency,
}: {
  months: IncomeExpensePoint[]
  currency: CurrencyCode
}) {
  return (
    <div>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-44 w-full [&_.recharts-cartesian-axis-tick_text]:tabular-nums"
      >
        {/* accessibilityLayer: arrow keys walk the months with the same
            tooltip the pointer gets. */}
        <BarChart
          data={months}
          margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          barGap={2}
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
          {/* No value axis in the 1b card — magnitudes read from the paired
              bars, exact amounts from the tooltip and the sr-only table. */}
          <ChartTooltip
            isAnimationActive={false}
            content={
              <ChartTooltipContent
                labelFormatter={(_, items) => {
                  const month = (items[0]?.payload as IncomeExpensePoint | undefined)?.month
                  return month === undefined ? null : monthLabel(month, 'full')
                }}
                // The default row renders raw minor units; this one formats
                // the exact amount, keyed by a small box in the series color
                // — a bar's identity mark.
                formatter={(value, name) => (
                  <>
                    <div
                      className="size-2.5 self-center rounded-[2px]"
                      style={{ background: `var(--color-${name})` }}
                    />
                    <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                      <span className="text-muted-foreground">
                        {chartConfig[name as keyof typeof chartConfig]?.label ?? name}
                      </span>
                      <span className="font-medium text-foreground tabular-nums">
                        {formatAmount(Number(value), currency)}
                      </span>
                    </div>
                  </>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {/* Rounded at the data end, square at the baseline; a fixed cap
              keeps short windows from ballooning into slabs. */}
          <Bar
            dataKey="income"
            fill="var(--color-income)"
            maxBarSize={12}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="expense"
            fill="var(--color-expense)"
            maxBarSize={12}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
      {/* Every value the tooltip shows, reachable without a pointer. */}
      <table className="sr-only">
        <caption>Income vs expense by month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Income</th>
            <th scope="col">Expense</th>
          </tr>
        </thead>
        <tbody>
          {months.map((point) => (
            <tr key={point.month}>
              <td>{monthLabel(point.month, 'full')}</td>
              <td>{formatAmount(point.income, currency)}</td>
              <td>{formatAmount(point.expense, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
