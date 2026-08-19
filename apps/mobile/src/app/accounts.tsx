import type { ApiClient } from '@pfinance/api-client'
import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import { ACCOUNT_TYPES } from '@pfinance/db/account-types'
import { Redirect } from 'expo-router'
import type { InferResponseType } from 'hono/client'
import { useState, type JSX } from 'react'
import { FlatList, View } from 'react-native'
import { queryFailure } from '@/api/errors'
import { oldestUpdatedAt } from '@/api/staleness'
import { useAccounts } from '@/api/use-accounts'
import { useHousehold } from '@/api/use-me'
import { railBars, type RailBar } from '@/charts/rail'
import { AdjustBalanceSheet } from '@/components/adjust-balance-sheet'
import { Figure } from '@/components/amount'
import { Chevron } from '@/components/chevron'
import { ListScreen, ListStatus } from '@/components/list-screen'
import { OfflineBanner } from '@/components/offline-banner'
import { MagBar } from '@/components/rail'
import { Touchable } from '@/components/touchable'
import { Badge, Body } from '@/components/type'
import { storedServerUrl } from '@/connect/store'

// The Account list with Balances (issue #78): every Balance is derived
// server-side — opening balance plus the ledger sum (ADR 0001) — and
// rendered through the shared currency package (ADR 0006), never computed
// here. Each Balance also hangs off the rail, so a household's debt leans
// one way and its savings the other: liabilities are badged, and their sign
// is user-carried, never flipped by kind.

type AccountEntry = InferResponseType<ApiClient['api']['accounts']['$get'], 200>['accounts'][number]

const typeLabels = new Map<string, string>(ACCOUNT_TYPES.map(({ type, label }) => [type, label]))

function AccountRow({
  entry,
  currency,
  bar,
  index,
  onPress,
}: {
  entry: AccountEntry
  currency: CurrencyCode
  bar: RailBar
  index: number
  onPress: () => void
}): JSX.Element {
  return (
    <Touchable
      feedback="dim"
      accessibilityRole="button"
      accessibilityHint="Opens balance adjustment"
      onPress={onPress}
      className="flex-row items-center justify-between gap-3 py-3.5"
    >
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Body numberOfLines={1} className="shrink">
            {entry.name}
          </Body>
          {entry.kind === 'liability' && <Badge>Liability</Badge>}
        </View>
        <Body size="sm" tone="muted">
          {typeLabels.get(entry.type) ?? entry.type}
        </Body>
      </View>
      <Figure size="lg">{formatAmount(entry.balance, currency)}</Figure>
      <MagBar bar={bar} index={index} />
      <Chevron direction="right" size={14} />
    </Touchable>
  )
}

export default function AccountsScreen(): JSX.Element {
  const apiUrl = storedServerUrl()

  const { me, currency } = useHousehold()
  const accounts = useAccounts(false)
  const [adjusting, setAdjusting] = useState<AccountEntry | null>(null)

  if (apiUrl === null) return <Redirect href="/" />

  const { error, retry } = queryFailure([me, accounts])
  const loaded = me.data !== undefined && accounts.data !== undefined
  const entries = accounts.data?.accounts ?? []
  // One scale for the whole list, so two balances of the same size draw the
  // same length however far apart they sit.
  const bars = railBars(entries.map((entry) => ({ amount: entry.balance, neutral: false })))

  return (
    <ListScreen title="Accounts" eyebrow="Balances">
      {error !== null && loaded && (
        <OfflineBanner updatedAt={oldestUpdatedAt([me, accounts])} retry={retry} />
      )}
      {!loaded || accounts.data === undefined ? (
        <ListStatus error={loaded ? null : error} retry={retry} />
      ) : entries.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          empty="Create an account on the web app and its balance appears here."
        />
      ) : (
        <FlatList
          className="flex-1"
          data={entries}
          keyExtractor={(entry) => entry.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const bar = bars[index]
            return bar === undefined ? null : (
              <AccountRow
                entry={item}
                currency={currency}
                bar={bar}
                index={index}
                onPress={() => setAdjusting(item)}
              />
            )
          }}
        />
      )}
      <AdjustBalanceSheet
        account={adjusting}
        onClose={() => setAdjusting(null)}
        currency={currency}
      />
    </ListScreen>
  )
}
