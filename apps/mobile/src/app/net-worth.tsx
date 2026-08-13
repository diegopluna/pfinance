import { call, type ApiClient } from '@pfinance/api-client'
import { formatAmount } from '@pfinance/currency'
import { Redirect } from 'expo-router'
import { Typography } from 'heroui-native'
import type { InferResponseType } from 'hono/client'
import { useCallback, type JSX } from 'react'
import { ScrollView, View } from 'react-native'
import { apiFor } from '@/api/client'
import { useHousehold } from '@/api/use-household'
import { useApiQuery } from '@/api/use-query'
import { monthLabel } from '@/charts/months'
import { NetWorthChart } from '@/components/charts/net-worth-chart'
import { ListScreen, ListStatus } from '@/components/list-screen'
import { storedServerUrl } from '@/connect/store'

// The Net Worth dashboard (issue #79), the 1b hero cut for a phone
// (docs/design/DECISIONS.md): the current value and its month-over-month
// delta as text the chart alone would keep too quiet, over the slot-1 area.
// The series arrives server-derived (ADR 0001) — liabilities already count
// negatively through their user-carried signs — and every amount renders
// through the shared currency package (ADR 0006). No `through` filter: the
// dashboard always reads up to the current month.

type NetWorthSeries = InferResponseType<ApiClient['api']['net-worth']['$get'], 200>['series']

export default function NetWorthScreen(): JSX.Element {
  const apiUrl = storedServerUrl()

  const { me, currency } = useHousehold(apiUrl)
  const fetchNetWorth = useCallback(
    () =>
      call(
        apiFor(apiUrl ?? '').api['net-worth'].$get({ query: { through: undefined } }),
        'Could not load your Net Worth.',
      ),
    [apiUrl],
  )
  const netWorth = useApiQuery(apiUrl === null ? null : fetchNetWorth)

  if (apiUrl === null) return <Redirect href="/" />

  const error = me.error ?? netWorth.error
  const retry = () => {
    if (me.error !== null) me.retry()
    if (netWorth.error !== null) netWorth.retry()
  }
  const loaded = me.data !== null && netWorth.data !== null

  return (
    <ListScreen title="Net worth">
      {error !== null || !loaded || netWorth.data === null ? (
        <ListStatus error={error} retry={retry} />
      ) : netWorth.data.series.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          empty="Nothing to show yet — add accounts on the web app to start the ledger. Net worth, income, and spending build on them."
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Headline series={netWorth.data.series} currency={currency} />
          <View className="mt-4">
            <NetWorthChart series={netWorth.data.series} currency={currency} />
          </View>
        </ScrollView>
      )}
    </ListScreen>
  )
}

// The hero text: current value, then the delta vs the previous month with
// its percentage — up success-colored, down danger-colored, direction
// carried by the arrow and the sign never dropped from the words.
function Headline({
  series,
  currency,
}: {
  series: NetWorthSeries
  currency: ReturnType<typeof useHousehold>['currency']
}): JSX.Element {
  const current = series.at(-1)
  const previous = series.at(-2)
  const delta =
    current !== undefined && previous !== undefined
      ? current.netWorth - previous.netWorth
      : undefined
  const pct =
    delta !== undefined && previous !== undefined && previous.netWorth !== 0
      ? new Intl.NumberFormat(undefined, {
          style: 'percent',
          maximumFractionDigits: 1,
        }).format(Math.abs(delta / previous.netWorth))
      : undefined
  return (
    <View className="gap-1">
      <Typography.Heading
        type="h1"
        className="font-bold tracking-tight"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {current === undefined ? '' : formatAmount(current.netWorth, currency)}
      </Typography.Heading>
      {delta !== undefined && previous !== undefined && (
        <View className="flex-row items-center gap-1.5">
          <Typography.Paragraph
            type="body-sm"
            className={`font-semibold ${delta < 0 ? 'text-danger' : 'text-success'}`}
            style={{ fontVariant: ['tabular-nums'] }}
            accessibilityLabel={`${delta < 0 ? 'Down' : 'Up'} ${formatAmount(Math.abs(delta), currency)} versus ${monthLabel(previous.month, 'month')}`}
          >
            {delta < 0 ? '▼' : '▲'} {formatAmount(Math.abs(delta), currency)}
            {pct === undefined ? '' : ` (${pct})`}
          </Typography.Paragraph>
          <Typography.Paragraph type="body-sm" color="muted">
            vs {monthLabel(previous.month, 'month')}
          </Typography.Paragraph>
        </View>
      )}
    </View>
  )
}
