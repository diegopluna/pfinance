import { call, type ApiClient } from '@pfinance/api-client'
import { Redirect } from 'expo-router'
import type { InferResponseType } from 'hono/client'
import { useCallback, type JSX } from 'react'
import { ScrollView, View } from 'react-native'
import { apiFor } from '@/api/client'
import { useHousehold } from '@/api/use-household'
import { useApiQuery } from '@/api/use-query'
import { monthLabel } from '@/charts/months'
import { NetWorthChart } from '@/components/charts/net-worth-chart'
import { ListScreen, ListStatus } from '@/components/list-screen'
import { NetWorthHeadline } from '@/components/net-worth-headline'
import { Body } from '@/components/type'
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
    <ListScreen title="Net worth" eyebrow="Every account, by month">
      {error !== null || !loaded || netWorth.data === null ? (
        <ListStatus error={error} retry={retry} />
      ) : netWorth.data.series.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          empty="Add accounts on the web app to start the ledger. Net worth, income, and spending all build on them."
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <NetWorthHeadline series={netWorth.data.series} currency={currency} />
          <View className="mt-6">
            <NetWorthChart series={netWorth.data.series} currency={currency} />
          </View>
          <Span series={netWorth.data.series} />
        </ScrollView>
      )}
    </ListScreen>
  )
}

// What the frame covers, said in words: a chart whose axis labels are
// compact by design shouldn't leave its own span to be inferred.
function Span({ series }: { series: NetWorthSeries }): JSX.Element | null {
  const first = series[0]
  const last = series.at(-1)
  if (first === undefined || last === undefined || first.month === last.month) return null
  return (
    <Body size="sm" tone="muted" className="pt-4">
      {monthLabel(first.month, 'tick')} to {monthLabel(last.month, 'tick')}
    </Body>
  )
}
