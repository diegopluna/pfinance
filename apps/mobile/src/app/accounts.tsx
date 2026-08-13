import { formatAmount, isSupportedCurrency, type CurrencyCode } from '@pfinance/currency'
import { ACCOUNT_TYPES } from '@pfinance/db/account-types'
import { call } from '@pfinance/api-client'
import type { InferResponseType } from 'hono/client'
import { Redirect } from 'expo-router'
import { Chip, Typography } from 'heroui-native'
import { useCallback, type JSX } from 'react'
import { FlatList, View } from 'react-native'
import { apiFor } from '@/api/client'
import { useApiQuery } from '@/api/use-query'
import { Amount } from '@/components/amount'
import { ListScreen, ListStatus } from '@/components/list-screen'
import { storedServerUrl } from '@/connect/store'

// The Account list with Balances (issue #78): every Balance is derived
// server-side — opening balance plus the ledger sum (ADR 0001) — and
// rendered through the shared currency package (ADR 0006), never computed
// here. Liabilities carry the LIABILITY badge so debt reads as debt at a
// glance; their sign is user-carried, never flipped by kind.

type ApiShape = ReturnType<typeof apiFor>
type AccountEntry = InferResponseType<ApiShape['api']['accounts']['$get'], 200>['accounts'][number]

const typeLabels = new Map<string, string>(ACCOUNT_TYPES.map(({ type, label }) => [type, label]))

function AccountRow({
  entry,
  currency,
}: {
  entry: AccountEntry
  currency: CurrencyCode
}): JSX.Element {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-separator py-3">
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Typography.Paragraph numberOfLines={1} className="shrink font-medium">
            {entry.name}
          </Typography.Paragraph>
          {entry.kind === 'liability' && (
            <Chip size="sm" variant="soft" color="default">
              <Chip.Label>Liability</Chip.Label>
            </Chip>
          )}
        </View>
        <Typography.Paragraph type="body-sm" color="muted">
          {typeLabels.get(entry.type) ?? entry.type}
        </Typography.Paragraph>
      </View>
      <Amount amount={{ text: formatAmount(entry.balance, currency), tone: 'plain' }} />
    </View>
  )
}

export default function AccountsScreen(): JSX.Element {
  const apiUrl = storedServerUrl()

  const fetchMe = useCallback(
    () => call(apiFor(apiUrl ?? '').api.me.$get(), 'Could not load your Household.'),
    [apiUrl],
  )
  const fetchAccounts = useCallback(
    () =>
      call(
        apiFor(apiUrl ?? '').api.accounts.$get({ query: { includeArchived: 'false' } }),
        'Could not load your Accounts.',
      ),
    [apiUrl],
  )
  const me = useApiQuery(apiUrl === null ? null : fetchMe)
  const accounts = useApiQuery(apiUrl === null ? null : fetchAccounts)

  if (apiUrl === null) return <Redirect href="/" />

  // A Server newer than this build may know Currencies this bundle doesn't;
  // formatting falls back rather than crashing the list (the web stance).
  const currency: CurrencyCode =
    me.data !== null && isSupportedCurrency(me.data.household.currency)
      ? me.data.household.currency
      : 'USD'

  const error = me.error ?? accounts.error
  const retry = () => {
    if (me.error !== null) me.retry()
    if (accounts.error !== null) accounts.retry()
  }
  const loaded = me.data !== null && accounts.data !== null

  return (
    <ListScreen title="Accounts">
      {error !== null || !loaded || accounts.data === null ? (
        <ListStatus error={error} retry={retry} />
      ) : accounts.data.accounts.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          empty="No accounts yet — create one on the web app to start the ledger."
        />
      ) : (
        <FlatList
          data={accounts.data.accounts}
          keyExtractor={(entry) => entry.id}
          renderItem={({ item }) => <AccountRow entry={item} currency={currency} />}
        />
      )}
    </ListScreen>
  )
}
