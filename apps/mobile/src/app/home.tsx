import { call, type ApiClient } from '@pfinance/api-client'
import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import { Redirect, router } from 'expo-router'
import { Button, Spinner } from 'heroui-native'
import type { InferResponseType } from 'hono/client'
import { useCallback, type JSX, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { apiFor } from '@/api/client'
import { useHousehold } from '@/api/use-household'
import { useApiQuery } from '@/api/use-query'
import { monthLabel } from '@/charts/months'
import { railBars } from '@/charts/rail'
import { Figure } from '@/components/amount'
import { Chevron } from '@/components/chevron'
import { NetWorthHeadline } from '@/components/net-worth-headline'
import { Rail, RailBand, RULE } from '@/components/rail'
import { Body, Eyebrow } from '@/components/type'
import { storedServerUrl } from '@/connect/store'

// Where sign-in lands, and where every relaunch with a live session opens
// (issue #77). It used to be a menu of buttons; it is now the standing
// answer to the two questions a phone gets asked — where do we stand, and
// what moved — with the app's one high-frequency verb (issue #80) pinned
// under it where a thumb already is.
//
// Every quantity on it hangs off the rail (src/charts/rail.ts): net worth
// is the number, this month's income and expenses are the two bars that
// moved it, and the Accounts are the places it sits. Reading down the
// screen is reading the same rule at three scales.

type AccountEntry = InferResponseType<ApiClient['api']['accounts']['$get'], 200>['accounts'][number]
type MonthTotals = InferResponseType<
  ApiClient['api']['income-vs-expense']['$get'],
  200
>['months'][number]

const ACCOUNTS_SHOWN = 5

export default function HomeScreen(): JSX.Element {
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
  const fetchAccounts = useCallback(
    () =>
      call(
        apiFor(apiUrl ?? '').api.accounts.$get({ query: { includeArchived: 'false' } }),
        'Could not load your Accounts.',
      ),
    [apiUrl],
  )
  const fetchIncomeExpense = useCallback(
    () =>
      call(
        apiFor(apiUrl ?? '').api['income-vs-expense'].$get({ query: { through: undefined } }),
        'Could not load income vs expense.',
      ),
    [apiUrl],
  )

  const skip = apiUrl === null
  const netWorth = useApiQuery(skip ? null : fetchNetWorth)
  const accounts = useApiQuery(skip ? null : fetchAccounts)
  const incomeExpense = useApiQuery(skip ? null : fetchIncomeExpense)

  if (apiUrl === null) return <Redirect href="/" />

  const queries = [me, netWorth, accounts, incomeExpense]
  const error = queries.find((query) => query.error !== null)?.error ?? null
  const retry = () => {
    for (const query of queries) if (query.error !== null) query.retry()
  }
  const loaded = queries.every((query) => query.data !== null)

  if (error !== null) {
    return (
      <Frame>
        <View className="gap-3 pt-8">
          <Eyebrow tone="foreground">Can&apos;t reach your Server</Eyebrow>
          <Body tone="muted">{error}</Body>
        </View>
        <View className="gap-3 pt-4">
          <Button onPress={retry}>Try again</Button>
          <Button variant="ghost" onPress={() => router.push('/settings')}>
            Settings
          </Button>
        </View>
      </Frame>
    )
  }

  if (!loaded || me.data === null) {
    return (
      <Frame>
        <View className="items-start pt-10">
          <Spinner size="lg" />
        </View>
      </Frame>
    )
  }

  const latest = incomeExpense.data?.months.at(-1)
  const active = accounts.data?.accounts ?? []

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 28 }}
        >
          <View className="gap-7 px-5 pt-2">
            <View className="flex-row items-center justify-between">
              <Eyebrow numberOfLines={1} className="flex-1">
                {me.data.household.name}
              </Eyebrow>
              <Eyebrow>{me.data.household.currency}</Eyebrow>
            </View>

            {/* The headline is the doorway to its own history: the number
                is the summary, the chart behind it is the story. */}
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Opens net worth by month"
              onPress={() => router.push('/net-worth')}
              className="flex-row items-end justify-between gap-3"
            >
              {netWorth.data !== null && netWorth.data.series.length > 0 ? (
                <NetWorthHeadline series={netWorth.data.series} currency={currency} />
              ) : (
                <View className="gap-1.5">
                  <Eyebrow>Net worth</Eyebrow>
                  <Body tone="muted">Add an account on the web app and net worth starts here.</Body>
                </View>
              )}
              <View className="pb-2">
                <Chevron direction="right" />
              </View>
            </Pressable>

            {latest !== undefined && <MonthPair month={latest} currency={currency} />}

            {active.length > 0 && <Accounts entries={active} currency={currency} />}

            <View>
              <Doorway label="Transactions" to="/transactions" />
              <Doorway label="Spending" to="/spending" />
              <Doorway label="Income vs expense" to="/income-expense" />
              <Doorway label="Settings" to="/settings" last />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Recording a Transaction is the highest-frequency task in the
          product (issue #70), so it is the one thing that never scrolls. */}
      <View className="border-separator border-t bg-background">
        <SafeAreaView edges={['bottom', 'left', 'right']}>
          <View className="px-5 pt-3 pb-1">
            <Button
              onPress={() => router.push({ pathname: '/transactions', params: { new: 'true' } })}
            >
              New transaction
            </Button>
          </View>
        </SafeAreaView>
      </View>
    </View>
  )
}

// The shell the pre-data states borrow, so a slow Server and a reachable
// one put their first line in the same place.
function Frame({ children }: { children: ReactNode }): JSX.Element {
  return (
    <View className="flex-1 bg-background">
      <SafeAreaView style={{ flex: 1 }}>
        <View className="flex-1 gap-2 px-5 pt-2">{children}</View>
      </SafeAreaView>
    </View>
  )
}

function SectionHeader({
  label,
  meta,
  onPress,
  hint,
}: {
  label: string
  meta?: string
  onPress?: () => void
  hint?: string
}): JSX.Element {
  const content = (
    <View className="flex-row items-center gap-2 pb-1">
      <Eyebrow>{label}</Eyebrow>
      {meta !== undefined && <Eyebrow>· {meta}</Eyebrow>}
      <View className="flex-1" />
      {onPress !== undefined && <Chevron direction="right" size={14} />}
    </View>
  )
  return onPress === undefined ? (
    content
  ) : (
    <Pressable accessibilityRole="button" accessibilityHint={hint} onPress={onPress}>
      {content}
    </Pressable>
  )
}

// This month, as the two bars that made it. Income and expense arrive as
// magnitudes from the server's derived views, so the rail re-signs them —
// out is out. Both exclude Transfers and Balance Adjustments by definition
// (docs/design/DECISIONS.md), which is why the footnote is not optional.
function MonthPair({
  month,
  currency,
}: {
  month: MonthTotals
  currency: CurrencyCode
}): JSX.Element {
  const bars = railBars([
    { amount: month.income, neutral: false },
    { amount: -month.expense, neutral: false },
  ])
  const rows = [
    { label: 'Income', total: month.income, bar: bars[0] },
    { label: 'Expenses', total: month.expense, bar: bars[1] },
  ]
  return (
    <View>
      <SectionHeader
        label="This month"
        meta={monthLabel(month.month, 'full')}
        onPress={() => router.push('/income-expense')}
        hint="Opens income versus expense by month"
      />
      <Rail rule={RULE.symmetric}>
        {rows.map(
          (row, index) =>
            row.bar !== undefined && (
              <View key={row.label} className="flex-row items-center justify-between gap-3 py-2.5">
                <Body>{row.label}</Body>
                <Figure>{formatAmount(row.total, currency)}</Figure>
                <RailBand bar={row.bar} rule={RULE.symmetric} index={index} animate />
              </View>
            ),
        )}
      </Rail>
      <Body size="sm" tone="muted" className="pt-3">
        Excludes transfers and adjustments
      </Body>
    </View>
  )
}

// Where the net worth sits. A liability leans left for the same reason a
// grocery bill does — its Balance is negative, and no kind flips a sign
// (ADR 0001).
function Accounts({
  entries,
  currency,
}: {
  entries: AccountEntry[]
  currency: CurrencyCode
}): JSX.Element {
  const shown = entries.slice(0, ACCOUNTS_SHOWN)
  const bars = railBars(shown.map((entry) => ({ amount: entry.balance, neutral: false })))
  return (
    <View>
      <SectionHeader
        label="Accounts"
        meta={String(entries.length)}
        onPress={() => router.push('/accounts')}
        hint="Opens every account with its balance"
      />
      <Rail>
        {shown.map((entry, index) => {
          const bar = bars[index]
          return (
            bar !== undefined && (
              <View key={entry.id} className="flex-row items-center justify-between gap-3 py-2.5">
                <Body numberOfLines={1} className="flex-1">
                  {entry.name}
                </Body>
                <Figure>{formatAmount(entry.balance, currency)}</Figure>
                <RailBand bar={bar} index={index} animate />
              </View>
            )
          )
        })}
      </Rail>
    </View>
  )
}

function Doorway({
  label,
  to,
  last = false,
}: {
  label: string
  to: '/transactions' | '/spending' | '/income-expense' | '/settings'
  last?: boolean
}): JSX.Element {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(to)}
      className={`flex-row items-center justify-between py-3.5 ${last ? '' : 'border-separator border-b'}`}
    >
      <Text className="font-mono text-[15px] text-foreground">{label}</Text>
      <Chevron direction="right" size={14} />
    </Pressable>
  )
}
