import type { ApiClient } from '@pfinance/api-client'
import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import { Redirect, router } from 'expo-router'
import { Button, Spinner } from 'heroui-native'
import type { InferResponseType } from 'hono/client'
import type { JSX, ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { queryFailure } from '@/api/errors'
import { useAccounts } from '@/api/use-accounts'
import { useIncomeExpense, useNetWorth } from '@/api/use-dashboards'
import { useHousehold } from '@/api/use-me'
import { monthLabel } from '@/charts/months'
import { railBars } from '@/charts/rail'
import { Figure } from '@/components/amount'
import { Chevron } from '@/components/chevron'
import { NetWorthHeadline } from '@/components/net-worth-headline'
import { Rail, RailBand, RULE } from '@/components/rail'
import { Touchable } from '@/components/touchable'
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
// Income and Expenses: what the Accounts' draw-in queues up behind.
const MONTH_ROWS = 2

export default function HomeScreen(): JSX.Element {
  const apiUrl = storedServerUrl()
  const { me, currency } = useHousehold()
  const netWorth = useNetWorth()
  const accounts = useAccounts(false)
  const incomeExpense = useIncomeExpense()

  if (apiUrl === null) return <Redirect href="/" />

  const { error, retry } = queryFailure([me, netWorth, accounts, incomeExpense])
  const loaded = [me, netWorth, accounts, incomeExpense].every((query) => query.data !== undefined)

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

  if (!loaded || me.data === undefined) {
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
            <Touchable
              accessibilityRole="button"
              accessibilityHint="Opens net worth by month"
              onPress={() => router.push('/insights?view=net-worth')}
              className="flex-row items-end justify-between gap-3"
            >
              {netWorth.data !== undefined && netWorth.data.series.length > 0 ? (
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
            </Touchable>

            {latest !== undefined && <MonthPair month={latest} currency={currency} />}

            {active.length > 0 && <Accounts entries={active} currency={currency} />}
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Recording a Transaction is the highest-frequency task in the
          product (issue #70), so it is the one thing that never scrolls. It
          sits straight on the tab bar, which owns the bottom inset and the
          hairline — a second rule 60px above the first would read as two
          footers rather than one place to act. */}
      {/* Above the tab bar, and opaque: a full-width button with the
          ledger showing through it is a worse trade than the glass makes on
          this one screen. The bottom inset is the bar's own — the native
          tab bar reports it as safe area. */}
      <View className="bg-background px-5 pt-3">
        <SafeAreaView edges={['bottom', 'left', 'right']}>
          <Button
            onPress={() => router.push({ pathname: '/transactions', params: { new: 'true' } })}
          >
            New transaction
          </Button>
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
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
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
    // hitSlop rather than padding: the target has to clear 24px (44px is
    // the touch aim) without opening the gap the section rhythm depends on.
    <Touchable accessibilityRole="button" accessibilityHint={hint} hitSlop={14} onPress={onPress}>
      {content}
    </Touchable>
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
        onPress={() => router.push('/insights?view=income-expense')}
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
                {/* Continues the sequence the month pair started rather
                    than restarting it, so the screen draws itself once
                    from the top instead of in two places at once. */}
                <RailBand bar={bar} index={index + MONTH_ROWS} animate />
              </View>
            )
          )
        })}
      </Rail>
    </View>
  )
}
