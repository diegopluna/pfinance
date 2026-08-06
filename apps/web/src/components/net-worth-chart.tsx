import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { InferResponseType } from 'hono/client'
import { formatAmount, getCurrency, type CurrencyCode } from '@pfinance/currency'
import { api } from '@/lib/api'

// The monthly Net Worth line (issue #17). The series arrives server-derived —
// this component only draws it. One series, so no legend: the section title
// names the line, and the current value rides the header next to it.

// Inferred from the RPC schema (the AccountEntry pattern) so the point shape
// can never drift from what the server sends.
type NetWorthPoint = InferResponseType<(typeof api.api)['net-worth']['$get'], 200>['series'][number]

// `YYYY-MM` → a human month. The Date is built in UTC and formatted in UTC,
// so no viewer timezone can shift the label across a month boundary.
const monthLabel = (month: string, style: 'tick' | 'full') => {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1))
  return new Intl.DateTimeFormat(undefined, {
    month: style === 'tick' ? 'short' : 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

// Axis ticks get the compact form ("R$ 2 mil"); exact amounts live in the
// tooltip and the table via formatAmount. Ticks are display-only geometry, so
// the one float division here never touches a ledger amount that is kept.
const compactAmount = (minorUnits: number, currency: CurrencyCode) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(minorUnits / 10 ** getCurrency(currency).minorUnitExponent)

// The value leads and the series name follows — the reader hovering a month
// already knows what line this is and wants the number.
function SeriesTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean
  payload?: { payload: NetWorthPoint }[]
  currency: CurrencyCode
}) {
  const point = payload?.[0]?.payload
  if (active !== true || point === undefined) return null
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <p className="text-sm font-semibold tabular-nums">{formatAmount(point.netWorth, currency)}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          aria-hidden
          className="h-0.5 w-3 rounded-full"
          style={{ background: 'var(--net-worth-line)' }}
        />
        Net worth · {monthLabel(point.month, 'full')}
      </p>
    </div>
  )
}

export function NetWorthChart({
  series,
  currency,
}: {
  series: NetWorthPoint[]
  currency: CurrencyCode
}) {
  return (
    // The line is --chart-1 in light mode; the token's dark value misses 3:1
    // contrast on the dark surface (2.9:1), so dark mode selects a lighter
    // step of the same hue — validated against oklch(0.145 0 0).
    <div className="[--net-worth-line:var(--chart-1)] dark:[--net-worth-line:oklch(0.58_0.2_264.376)] [&_.recharts-cartesian-axis-tick_text]:tabular-nums">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {/* accessibilityLayer: arrow keys walk the months with the same
              tooltip the pointer gets. */}
          <LineChart
            data={series}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            accessibilityLayer
          >
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeWidth={1} />
            <XAxis
              dataKey="month"
              tickFormatter={(month: string) => monthLabel(month, 'tick')}
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
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
              tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={70}
            />
            {/* The crosshair snaps to the nearest month, so nobody aims at a
                2px line; the hairline matches the grid's recessive gray. */}
            <Tooltip
              cursor={{ stroke: 'var(--color-border)', strokeWidth: 1 }}
              content={<SeriesTooltip currency={currency} />}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="netWorth"
              stroke="var(--net-worth-line)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              // Only the endpoint is marked — an 8px dot ringed in the
              // surface color — so today's position reads without labeling
              // every month.
              dot={({ key, index, cx, cy }) =>
                index === series.length - 1 && cx !== undefined && cy !== undefined ? (
                  <circle
                    key={key}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill="var(--net-worth-line)"
                    stroke="var(--color-background)"
                    strokeWidth={2}
                  />
                ) : (
                  <g key={key} />
                )
              }
              activeDot={{ r: 4, stroke: 'var(--color-background)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
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
