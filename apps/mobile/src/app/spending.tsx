import { call } from '@pfinance/api-client'
import { Redirect } from 'expo-router'
import { Button, Typography } from 'heroui-native'
import { useCallback, useState, type JSX } from 'react'
import { ScrollView, View } from 'react-native'
import { apiFor } from '@/api/client'
import { useHousehold } from '@/api/use-household'
import { useApiQuery } from '@/api/use-query'
import { addMonths, currentUtcMonth, monthLabel } from '@/charts/months'
import { SpendingBars } from '@/components/charts/spending-bars'
import { ListScreen, ListStatus } from '@/components/list-screen'
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

  return (
    <ListScreen title="Spending">
      <View className="flex-row items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          accessibilityLabel="Previous month"
          onPress={() => setMonth((current) => addMonths(current, -1))}
        >
          ‹
        </Button>
        {/* accessibilityLiveRegion: the month change a stepper tap causes
            is otherwise silent to a screen reader. */}
        <Typography.Paragraph
          className="font-medium"
          style={{ fontVariant: ['tabular-nums'] }}
          accessibilityLiveRegion="polite"
        >
          {monthLabel(month, 'full')}
        </Typography.Paragraph>
        <Button
          variant="ghost"
          size="sm"
          accessibilityLabel="Next month"
          onPress={() => setMonth((current) => addMonths(current, 1))}
        >
          ›
        </Button>
      </View>
      {error !== null || !loaded || spending.data === null ? (
        <ListStatus error={error} retry={retry} />
      ) : spending.data.slices.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          empty={`No spending recorded in ${monthLabel(month, 'full')}.`}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <SpendingBars slices={spending.data.slices} currency={currency} />
          {/* By definition (DECISIONS.md): every derived-spending surface
              carries this footnote visibly. */}
          <Typography.Paragraph type="body-sm" color="muted" className="mt-4">
            Excludes transfers and adjustments
          </Typography.Paragraph>
        </ScrollView>
      )}
    </ListScreen>
  )
}
