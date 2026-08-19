import { formatAmount } from '@pfinance/currency'
import { useState, type JSX } from 'react'
import { ScrollView, View } from 'react-native'
import { queryFailure } from '@/api/errors'
import { oldestUpdatedAt } from '@/api/staleness'
import { useSpending } from '@/api/use-dashboards'
import { useHousehold } from '@/api/use-me'
import { addMonths, currentUtcMonth, monthLabel } from '@/charts/months'
import { Figure } from '@/components/amount'
import { SpendingBars } from '@/components/charts/spending-bars'
import { Chevron } from '@/components/chevron'
import { ListStatus } from '@/components/list-screen'
import { OfflineBanner } from '@/components/offline-banner'
import { Touchable } from '@/components/touchable'
import { Body, Eyebrow } from '@/components/type'

// The Spending dashboard (issue #79): one calendar month of the Expense
// view grouped by Category (issue #18), server-summed and largest-first —
// this screen only renders. The month selector is a stepper, unbounded in
// both directions like the web card's: a future-dated expense is as real as
// an old one, and a quiet month shows its empty state rather than being
// unreachable. Transfers and Balance Adjustments are excluded by definition
// — the server derives the view; this screen only says so. Uncategorized is
// a first-class row, never hidden (DECISIONS.md).

export function SpendingView(): JSX.Element {
  const [month, setMonth] = useState(currentUtcMonth)

  const { me, currency } = useHousehold()
  // The month is part of the query key, so stepping refetches and a month
  // already visited comes straight back from cache.
  const spending = useSpending(month)

  const { error, retry } = queryFailure([me, spending])
  const loaded = me.data !== undefined && spending.data !== undefined
  const slices = spending.data?.slices ?? []
  const total = slices.reduce((sum, slice) => sum + slice.total, 0)

  return (
    <>
      <Stepper month={month} onStep={(delta) => setMonth((current) => addMonths(current, delta))} />
      {error !== null && loaded && (
        <OfflineBanner updatedAt={oldestUpdatedAt([me, spending])} retry={retry} />
      )}
      {!loaded || spending.data === undefined ? (
        <ListStatus error={loaded ? null : error} retry={retry} />
      ) : slices.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          empty={`Nothing was spent in ${monthLabel(month, 'full')}.`}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
          {/* The total is the sum of the bars: without it every row is a
              share of something the screen never states. */}
          <View className="flex-row items-baseline justify-between gap-3 pb-2">
            <Eyebrow>Total</Eyebrow>
            <Figure size="lg">{formatAmount(total, currency)}</Figure>
          </View>
          <SpendingBars slices={slices} currency={currency} />
          {/* By definition (DECISIONS.md): every derived-spending surface
              carries this footnote visibly. */}
          <Body size="sm" tone="muted" className="pt-5 pb-4">
            Excludes transfers and adjustments
          </Body>
        </ScrollView>
      )}
    </>
  )
}

// The month in hand, with a step either way. accessibilityLiveRegion: the
// month change a stepper tap causes is otherwise silent to a screen reader.
function Stepper({
  month,
  onStep,
}: {
  month: string
  onStep: (delta: number) => void
}): JSX.Element {
  return (
    <View className="flex-row items-center justify-between border-separator border-y py-2.5">
      <Step direction="left" label="Previous month" onPress={() => onStep(-1)} />
      <Eyebrow tone="foreground" accessibilityLiveRegion="polite">
        {monthLabel(month, 'full')}
      </Eyebrow>
      <Step direction="right" label="Next month" onPress={() => onStep(1)} />
    </View>
  )
}

function Step({
  direction,
  label,
  onPress,
}: {
  direction: 'left' | 'right'
  label: string
  onPress: () => void
}): JSX.Element {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={14}
      onPress={onPress}
      className="h-8 w-8 items-center justify-center"
    >
      <Chevron direction={direction} size={16} />
    </Touchable>
  )
}
