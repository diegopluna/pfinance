import { call } from '@pfinance/api-client'
import { formatAmount } from '@pfinance/currency'
import { Redirect } from 'expo-router'
import { useCallback, useState, type JSX } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { apiFor } from '@/api/client'
import { useHousehold } from '@/api/use-household'
import { useApiQuery } from '@/api/use-query'
import { addMonths, currentUtcMonth, monthLabel } from '@/charts/months'
import { Figure } from '@/components/amount'
import { SpendingBars } from '@/components/charts/spending-bars'
import { Chevron } from '@/components/chevron'
import { ListScreen, ListStatus } from '@/components/list-screen'
import { Body, Eyebrow } from '@/components/type'
import { storedServerUrl } from '@/connect/store'

// The Spending dashboard (issue #79): one calendar month of the Expense
// view grouped by Category (issue #18), server-summed and largest-first —
// this screen only renders. The month selector is a stepper, unbounded in
// both directions like the web card's: a future-dated expense is as real as
// an old one, and a quiet month shows its empty state rather than being
// unreachable. Transfers and Balance Adjustments are excluded by definition
// — the server derives the view; this screen only says so. Uncategorized is
// a first-class row, never hidden (DECISIONS.md).

export default function SpendingScreen(): JSX.Element {
  const apiUrl = storedServerUrl()
  const [month, setMonth] = useState(currentUtcMonth)

  const { me, currency } = useHousehold(apiUrl)
  // The month is part of the callback identity, so stepping refetches.
  const fetchSpending = useCallback(
    () =>
      call(
        apiFor(apiUrl ?? '').api['spending-by-category'].$get({ query: { month } }),
        'Could not load your spending.',
      ),
    [apiUrl, month],
  )
  const spending = useApiQuery(apiUrl === null ? null : fetchSpending)

  if (apiUrl === null) return <Redirect href="/" />

  const error = me.error ?? spending.error
  const retry = () => {
    if (me.error !== null) me.retry()
    if (spending.error !== null) spending.retry()
  }
  const loaded = me.data !== null && spending.data !== null
  const slices = spending.data?.slices ?? []
  const total = slices.reduce((sum, slice) => sum + slice.total, 0)

  return (
    <ListScreen title="Spending" eyebrow="By category">
      <Stepper month={month} onStep={(delta) => setMonth((current) => addMonths(current, delta))} />
      {error !== null || !loaded || spending.data === null ? (
        <ListStatus error={error} retry={retry} />
      ) : slices.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          empty={`Nothing was spent in ${monthLabel(month, 'full')}.`}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
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
    </ListScreen>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={14}
      onPress={onPress}
      className="h-8 w-8 items-center justify-center"
    >
      <Chevron direction={direction} size={16} />
    </Pressable>
  )
}
