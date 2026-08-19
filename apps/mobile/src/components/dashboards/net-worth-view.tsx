import type { ApiClient } from '@pfinance/api-client'
import type { InferResponseType } from 'hono/client'
import type { JSX } from 'react'
import { ScrollView, View } from 'react-native'
import { queryFailure } from '@/api/errors'
import { oldestUpdatedAt } from '@/api/staleness'
import { useNetWorth } from '@/api/use-dashboards'
import { useHousehold } from '@/api/use-me'
import { monthLabel } from '@/charts/months'
import { NetWorthChart } from '@/components/charts/net-worth-chart'
import { ListStatus } from '@/components/list-screen'
import { OfflineBanner } from '@/components/offline-banner'
import { NetWorthHeadline } from '@/components/net-worth-headline'
import { Body } from '@/components/type'

// The Net Worth dashboard (issue #79), the 1b hero cut for a phone
// (docs/design/DECISIONS.md): the current value and its month-over-month
// delta as text the chart alone would keep too quiet, over the slot-1 area.
// The series arrives server-derived (ADR 0001) — liabilities already count
// negatively through their user-carried signs — and every amount renders
// through the shared currency package (ADR 0006). No `through` filter: the
// dashboard always reads up to the current month.

type NetWorthSeries = InferResponseType<ApiClient['api']['net-worth']['$get'], 200>['series']

export function NetWorthView(): JSX.Element {
  const { me, currency } = useHousehold()
  const netWorth = useNetWorth()

  const { error, retry } = queryFailure([me, netWorth])
  const loaded = me.data !== undefined && netWorth.data !== undefined

  return (
    <>
      {error !== null && loaded && (
        <OfflineBanner updatedAt={oldestUpdatedAt([me, netWorth])} retry={retry} />
      )}
      {!loaded || netWorth.data === undefined ? (
        <ListStatus error={loaded ? null : error} retry={retry} />
      ) : netWorth.data.series.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          empty="Add accounts on the web app to start the ledger. Net worth, income, and spending all build on them."
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
          <NetWorthHeadline series={netWorth.data.series} currency={currency} />
          <View className="mt-6">
            <NetWorthChart series={netWorth.data.series} currency={currency} />
          </View>
          <Span series={netWorth.data.series} />
        </ScrollView>
      )}
    </>
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
