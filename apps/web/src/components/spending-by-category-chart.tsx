import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts'
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

// Spending by Category for one month (issue #18), drawn as horizontal bars —
// the form for comparing magnitudes across labeled categories. The slices
// arrive server-summed and largest-first; this component only draws them.
// Rows wear the five CVD-validated slots in rank order (docs/design/
// DECISIONS.md), and the Uncategorized slice always renders the neutral
// grey — a deliberate sixth slot, never one of the five — while its
// identity still lives in the row label, never in color alone.

type SpendingSlice = InferResponseType<
  (typeof api.api)['spending-by-category']['$get'],
  200
>['slices'][number]

const chartConfig = {
  spending: { label: 'Spending' },
} satisfies ChartConfig

// Rank order walks the five slots; slots cycle past five. All tokens are
// theme-aware in globals.css.
const SLOTS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

// The slice with no Category is the Uncategorized state (CONTEXT.md); the
// server sends it nameless, and the label is presentation.
const rowLabel = (slice: SpendingSlice) => slice.name ?? 'Uncategorized'

// Axis rows truncate long names to the tick width; the tooltip and the table
// carry them in full.
const tickLabel = (name: string) => (name.length > 16 ? `${name.slice(0, 15)}…` : name)

// Height follows the row count so bars stay a constant thickness instead of
// stretching to fill a fixed frame.
const ROW_HEIGHT = 32

export function SpendingByCategoryChart({
  slices,
  currency,
}: {
  slices: SpendingSlice[]
  currency: CurrencyCode
}) {
  // Slot index counts only categorized rows, so an Uncategorized slice mid-
  // list never shifts its neighbors' colors.
  let slotIndex = 0
  const rows = slices.map((slice) => ({
    key: slice.categoryId ?? 'uncategorized',
    label: rowLabel(slice),
    total: slice.total,
    fill:
      slice.categoryId === null ? 'var(--chart-uncategorized)' : SLOTS[slotIndex++ % SLOTS.length]!,
  }))
  return (
    <div>
      <ChartContainer
        config={chartConfig}
        className="aspect-auto w-full"
        style={{ height: rows.length * ROW_HEIGHT + 8 }}
      >
        {/* accessibilityLayer: arrow keys walk the rows with the same tooltip
            the pointer gets. */}
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 64, bottom: 4, left: 0 }}
          accessibilityLayer
        >
          {/* Every bar carries its value at the tip, so the value axis would
              only restate them — it stays hidden and the grid stays absent. */}
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            tickFormatter={tickLabel}
            tickLine={false}
            axisLine={false}
            width={112}
            tickMargin={6}
          />
          <ChartTooltip
            isAnimationActive={false}
            content={
              <ChartTooltipContent
                // The default row renders raw minor units; this one formats
                // the exact amount, keyed by a small box — a bar's identity
                // mark.
                formatter={(value, _name, item) => (
                  <>
                    <div
                      className="size-2.5 self-center rounded-[2px]"
                      style={{
                        background: (item as { payload?: { fill?: string } }).payload?.fill,
                      }}
                    />
                    <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                      <span className="text-muted-foreground">Spending</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {formatAmount(Number(value), currency)}
                      </span>
                    </div>
                  </>
                )}
              />
            }
          />
          <Bar
            dataKey="total"
            barSize={12}
            // Rounded at the data end, square at the baseline.
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          >
            {rows.map((row) => (
              <Cell key={row.key} fill={row.fill} />
            ))}
            {/* Value at the tip in a text token — compact form; the exact
                amount lives in the tooltip and the table. */}
            <LabelList
              dataKey="total"
              position="right"
              offset={8}
              className="fill-muted-foreground"
              fontSize={12}
              formatter={(value: React.ReactNode) => compactAmount(Number(value), currency)}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
      {/* Every value the tooltip shows, reachable without a pointer. */}
      <table className="sr-only">
        <caption>Spending by category</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Spending</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{formatAmount(row.total, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
