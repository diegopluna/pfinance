import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import { useThemeColor } from 'heroui-native'
import type { JSX } from 'react'
import { View } from 'react-native'
import { monthLabel } from '@/charts/months'
import { netWorthHeadline, type NetWorthPoint } from '@/charts/net-worth'
import { Figure } from '@/components/amount'
import { Caret } from '@/components/chevron'
import { Body, Eyebrow } from '@/components/type'

// The one number a household opens the app for, and the one line that says
// whether it is going the right way. Shared by the home screen and the Net
// Worth dashboard (issue #79) so the two can never quote it differently.
// Liabilities are already inside it, counted negatively through their
// user-carried signs (ADR 0001) — nothing here flips a sign by kind.
export function NetWorthHeadline({
  series,
  currency,
}: {
  series: NetWorthPoint[]
  currency: CurrencyCode
}): JSX.Element | null {
  const [success, danger] = useThemeColor(['success', 'danger'])
  const headline = netWorthHeadline(series)
  if (headline === null) return null

  const { current, delta, pct, previousMonth } = headline
  const down = delta !== null && delta < 0
  const percentage =
    pct === null
      ? ''
      : ` (${new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(pct)})`

  return (
    <View className="gap-1.5">
      <Eyebrow>Net worth</Eyebrow>
      <Figure size="hero">{formatAmount(current, currency)}</Figure>
      {delta !== null && previousMonth !== null && (
        <View
          className="flex-row items-center gap-1.5"
          accessibilityLabel={`${down ? 'Down' : 'Up'} ${formatAmount(Math.abs(delta), currency)}${percentage} versus ${monthLabel(previousMonth, 'month')}`}
        >
          <Caret direction={down ? 'down' : 'up'} color={down ? danger : success} />
          <Figure size="sm" tone={down ? 'negative' : 'positive'}>
            {`${formatAmount(Math.abs(delta), currency)}${percentage}`}
          </Figure>
          <Body size="sm" tone="muted">
            vs {monthLabel(previousMonth, 'month')}
          </Body>
        </View>
      )}
    </View>
  )
}
