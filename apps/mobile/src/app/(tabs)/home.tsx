import type { ApiClient } from '@pfinance/api-client'
import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import { Redirect, router } from 'expo-router'
import { Spinner } from 'heroui-native'
import { Button } from '@/components/button'
import type { InferResponseType } from 'hono/client'
import { useState, type JSX, type ReactNode } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { queryFailure } from '@/api/errors'
import { oldestUpdatedAt } from '@/api/staleness'
import { useAccounts } from '@/api/use-accounts'
import { useCategories } from '@/api/use-categories'
import { useIncomeExpense, useNetWorth } from '@/api/use-dashboards'
import { useHousehold } from '@/api/use-me'
import { monthLabel } from '@/charts/months'
import { railBars } from '@/charts/rail'
import { Figure } from '@/components/amount'
import { TrendWash } from '@/components/charts/trend-wash'
import { Chevron } from '@/components/chevron'
import { IconButton } from '@/components/icon-button'
import { PlateTouchable } from '@/components/plate'
import { NetWorthHeadline } from '@/components/net-worth-headline'
import { OfflineBanner } from '@/components/offline-banner'
import { QuickAddSheet } from '@/components/quick-add-sheet'
import { MagBar } from '@/components/rail'
import { Touchable } from '@/components/touchable'
import { Body, Eyebrow, SectionTitle } from '@/components/type'
import { storedServerUrl } from '@/connect/store'

// Where sign-in lands, and where every relaunch with a live session opens
// (issue #77). Three calm moments instead of a printout: the number (net
// worth and its delta), the landscape (the same series as an unlabeled
// area wash — atmosphere with truth in it), and two soft plates (this
// month's Kept line, the three largest Accounts). Everything that left
// this screen is exactly one tap away: the labeled chart and the month's
// breakdown live in Insights, the full Account list behind its plate.
// The one high-frequency verb (issue #80) rides the header as the
// screen's single prominent button.

type AccountEntry = InferResponseType<ApiClient['api']['accounts']['$get'], 200>['accounts'][number]

// The three largest by magnitude, so a liability stays visible and the
// glance never shows an all-blue fiction; the count in the plate's header
// carries the rest.
const ACCOUNTS_SHOWN = 3

export default function HomeScreen(): JSX.Element {
  const apiUrl = storedServerUrl()
  const { me, currency } = useHousehold()
  const netWorth = useNetWorth()
  const accounts = useAccounts(false)
  const categories = useCategories(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const incomeExpense = useIncomeExpense()

  if (apiUrl === null) return <Redirect href="/" />

  const { error, retry } = queryFailure([me, netWorth, accounts, incomeExpense])
  const loaded = [me, netWorth, accounts, incomeExpense].every((query) => query.data !== undefined)

  if (error !== null && !loaded) {
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

  const series = netWorth.data?.series ?? []
  const latest = incomeExpense.data?.months.at(-1)
  const active = accounts.data?.accounts ?? []

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 28 }}
        >
          <View className="gap-6 px-5 pt-2">
            <View className="flex-row items-center gap-3">
              <Eyebrow numberOfLines={1} className="flex-1">
                {me.data.household.name}
              </Eyebrow>
              <IconButton
                glyph="plus"
                label="New transaction"
                prominent
                onPress={() => setSheetOpen(true)}
              />
            </View>

            {error !== null && (
              <OfflineBanner
                updatedAt={oldestUpdatedAt([me, netWorth, accounts, incomeExpense])}
                retry={retry}
              />
            )}

            {/* The headline is the doorway to its own history: the label
                row carries the chevron every navigable thing on this
                screen wears. */}
            <Touchable
              accessibilityRole="button"
              accessibilityHint="Opens net worth by month"
              onPress={() => router.push('/insights?view=net-worth')}
              className="gap-1.5"
            >
              {series.length > 0 ? (
                <>
                  <View className="flex-row items-center gap-2">
                    <Eyebrow>Net worth</Eyebrow>
                    <View className="flex-1" />
                    <Chevron direction="right" size={14} />
                  </View>
                  <NetWorthHeadline series={series} currency={currency} label={false} />
                </>
              ) : (
                <View className="gap-1.5">
                  <Eyebrow>Net worth</Eyebrow>
                  <Body tone="muted">Add an account on the web app and net worth starts here.</Body>
                </View>
              )}
            </Touchable>
          </View>

          {/* The landscape: full-bleed, unlabeled, the exact series the
              dashboard charts — the shape of the story, not the reading
              of it. */}
          {series.length > 1 && (
            <View className="pt-1">
              <TrendWash series={series} />
            </View>
          )}

          <View className="gap-4 px-5 pt-5">
            {latest !== undefined && <KeptPlate month={latest} currency={currency} />}
            {active.length > 0 && <AccountsPlate entries={active} currency={currency} />}
          </View>
        </ScrollView>
      </SafeAreaView>
      <QuickAddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        accounts={active.map((entry) => ({ value: entry.id, label: entry.name }))}
        categories={(categories.data?.categories ?? []).map((entry) => ({
          value: entry.id,
          label: entry.name,
        }))}
        currency={currency}
      />
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

// The month said in one line: what the household kept. Income and expenses
// arrive as magnitudes from the server's derived view; the difference is
// the number the pair would otherwise make the reader compute. The detail —
// both sides, twelve months, and the excludes-footnote that qualifies them —
// lives behind the tap in the In vs out dashboard.
function KeptPlate({
  month,
  currency,
}: {
  month: { month: string; income: number; expense: number }
  currency: CurrencyCode
}): JSX.Element {
  const kept = month.income - month.expense
  return (
    <PlateTouchable
      accessibilityRole="button"
      accessibilityHint="Opens income versus expense by month"
      onPress={() => router.push('/insights?view=income-expense')}
      className="flex-row items-center gap-3 px-4 py-3.5"
    >
      <Body className="flex-1">Kept in {monthLabel(month.month, 'name')}</Body>
      <Figure tone={kept < 0 ? 'negative' : 'positive'}>
        {`${kept > 0 ? '+' : ''}${formatAmount(kept, currency)}`}
      </Figure>
      <Chevron direction="right" size={14} />
    </PlateTouchable>
  )
}

// Where the net worth sits: the three largest Accounts by magnitude, on
// one plate. A liability leans left for the same reason a grocery bill
// does — its Balance is negative, and no kind flips a sign (ADR 0001).
function AccountsPlate({
  entries,
  currency,
}: {
  entries: AccountEntry[]
  currency: CurrencyCode
}): JSX.Element {
  const shown = [...entries]
    .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance))
    .slice(0, ACCOUNTS_SHOWN)
  const bars = railBars(shown.map((entry) => ({ amount: entry.balance, neutral: false })))
  return (
    <PlateTouchable
      accessibilityRole="button"
      accessibilityHint="Opens every account with its balance"
      onPress={() => router.push('/accounts')}
      className="px-4 pt-3.5 pb-2"
    >
      <View className="flex-row items-center gap-2 pb-1">
        <SectionTitle>Accounts</SectionTitle>
        <Eyebrow>{String(entries.length)}</Eyebrow>
        <View className="flex-1" />
        <Chevron direction="right" size={14} />
      </View>
      {shown.map((entry, index) => {
        const bar = bars[index]
        return (
          bar !== undefined && (
            <View key={entry.id} className="flex-row items-center justify-between gap-3 py-2.5">
              <Body numberOfLines={1} className="flex-1">
                {entry.name}
              </Body>
              <Figure>{formatAmount(entry.balance, currency)}</Figure>
              <MagBar bar={bar} index={index} animate />
            </View>
          )
        )
      })}
    </PlateTouchable>
  )
}
