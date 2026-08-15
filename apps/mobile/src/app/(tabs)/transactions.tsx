import type { ApiClient } from '@pfinance/api-client'
import type { CurrencyCode } from '@pfinance/currency'
import type { DateFormat } from '@pfinance/db/date-formats'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { Button, Chip, SearchField } from 'heroui-native'
import type { InferResponseType } from 'hono/client'
import { useEffect, useState, type JSX } from 'react'
import { FlatList, ScrollView, View } from 'react-native'
import { queryFailure } from '@/api/errors'
import { useAccounts } from '@/api/use-accounts'
import { useCategories } from '@/api/use-categories'
import { useHousehold } from '@/api/use-me'
import { useTransactions } from '@/api/use-transactions'
import { railBars, type RailBar } from '@/charts/rail'
import { Amount } from '@/components/amount'
import { ListScreen, ListStatus } from '@/components/list-screen'
import { Rail, RailBand } from '@/components/rail'
import { TransactionForm } from '@/components/transaction-form'
import { TransferForm } from '@/components/transfer-form'
import { Touchable } from '@/components/touchable'
import { Badge, Body } from '@/components/type'
import { storedServerUrl } from '@/connect/store'
import { useTabBarInset } from '@/shell/tab-bar'
import { formatCalendarDate, todayCalendarString } from '@/ledger/dates'
import { categoryLabel, kindBadge, ledgerAmount } from '@/ledger/display'
import {
  noFilters,
  transactionQuery,
  UNCATEGORIZED,
  type PeriodPreset,
  type TransactionFilters,
} from '@/ledger/filters'

// The browsable Ledger (issue #78): the Transaction list with the existing
// API's filters — Account, Category (Uncategorized included, never hidden),
// the Expense/Income derived views, whole-month period presets over the
// from/to bounds, and description search. Amounts render through the ledger
// display rules (ledger/display.ts): a Transfer leg or Balance Adjustment
// is visibly badged and never reads as an ordinary entry. Quick entry
// (issue #80) lives here too: New and tapping a row open the form in place
// of the list, so the edited entry never has to survive a route change.
// Transfers (issue #81) get the sibling form the same way: New transfer,
// and tapping either leg opens the whole pair.

type TransactionEntry = InferResponseType<
  ApiClient['api']['transactions']['$get'],
  200
>['transactions'][number]

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}): JSX.Element {
  return (
    <Chip size="sm" variant={active ? 'primary' : 'soft'} color="default" onPress={onPress}>
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  )
}

// One horizontally scrolling row of mutually exclusive choices; '' is the
// "everything" choice, and picking the active value again clears back to it.
function ChipRow({
  choices,
  value,
  onChange,
}: {
  choices: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}): JSX.Element {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="flex-row gap-2">
        {choices.map((choice) => (
          <FilterChip
            key={choice.value}
            label={choice.label}
            active={value === choice.value}
            onPress={() => onChange(value === choice.value ? '' : choice.value)}
          />
        ))}
      </View>
    </ScrollView>
  )
}

function TransactionRow({
  entry,
  currency,
  dateFormat,
  accountNames,
  categoryNames,
  bar,
  index,
  onPress,
}: {
  entry: TransactionEntry
  currency: CurrencyCode
  dateFormat: DateFormat
  accountNames: Map<string, string>
  categoryNames: Map<string, string>
  bar: RailBar
  index: number
  onPress: () => void
}): JSX.Element {
  const badge = kindBadge(
    entry.kind,
    entry.amount,
    entry.counterpartAccountId === null
      ? null
      : (accountNames.get(entry.counterpartAccountId) ?? null),
  )
  const category =
    entry.categoryId === null
      ? categoryLabel(entry.kind, null)
      : categoryLabel(entry.kind, categoryNames.get(entry.categoryId) ?? 'Unknown category')
  return (
    <Touchable feedback="dim" onPress={onPress}>
      <View className="flex-row items-start justify-between gap-3 py-3">
        <View className="flex-1 gap-1">
          <Body numberOfLines={1}>{entry.description}</Body>
          <Body size="sm" tone="muted" numberOfLines={1}>
            {formatCalendarDate(entry.date, dateFormat)} ·{' '}
            {accountNames.get(entry.accountId) ?? 'Unknown account'} · {category}
          </Body>
          {badge !== null && (
            <View className="flex-row pt-0.5">
              <Badge>{badge}</Badge>
            </View>
          )}
        </View>
        <Amount amount={ledgerAmount(entry.kind, entry.amount, currency)} />
        {/* The row's own underline: how much, which way, against the same
            rule every other row is measured on. */}
        <RailBand bar={bar} index={index} />
      </View>
    </Touchable>
  )
}

const PERIOD_CHOICES: { value: PeriodPreset; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'last-3-months', label: 'Last 3 months' },
]

const isPeriodPreset = (value: string): value is PeriodPreset =>
  value === '' || PERIOD_CHOICES.some((choice) => choice.value === value)

export default function TransactionsScreen(): JSX.Element {
  const apiUrl = storedServerUrl()
  const tabBarInset = useTabBarInset()
  const [filters, setFilters] = useState<TransactionFilters>(noFilters)
  // The in-place form's target: null = closed, entry: null = create, an
  // existing row = edit. A Transfer leg opens the Transfer form — the pair
  // can never drift, so legs are only edited through their Transfer (issue
  // #81) — and the union pins that a transfer edit always carries its
  // Transfer's id. ?new=true (home's "New transaction") opens create on
  // arrival — the param is the trigger, so closing the form doesn't reopen.
  const [form, setForm] = useState<
    | { kind: 'transaction'; entry: TransactionEntry | null }
    | { kind: 'transfer'; entry: (TransactionEntry & { transferId: string }) | null }
    | null
  >(null)
  const { new: openNew } = useLocalSearchParams<{ new?: string }>()
  useEffect(() => {
    if (openNew === 'true') setForm({ kind: 'transaction', entry: null })
  }, [openNew])

  const { me, currency, dateFormat } = useHousehold()
  // Archived Accounts and Categories still name existing rows, so both
  // lookups load the full vocabulary (the web transactions screen's stance).
  const accounts = useAccounts(true)
  const categories = useCategories(true)
  // The query the filters compose is the cache key, so each combination
  // caches separately and the list holds while a new one loads.
  const transactions = useTransactions(transactionQuery(filters, todayCalendarString()))

  if (apiUrl === null) return <Redirect href="/" />

  const accountNames = new Map(
    (accounts.data?.accounts ?? []).map((entry) => [entry.id, entry.name]),
  )
  const categoryNames = new Map(
    (categories.data?.categories ?? []).map((entry) => [entry.id, entry.name]),
  )

  const { error, retry } = queryFailure([me, accounts, categories, transactions])
  const loaded = [me, accounts, categories, transactions].every((query) => query.data !== undefined)

  // Active (unarchived) choices only: an archived Account or Category can't
  // be picked as a filter, it just still names its old rows.
  const accountChoices = (accounts.data?.accounts ?? [])
    .filter((entry) => entry.archivedAt === null)
    .map((entry) => ({ value: entry.id, label: entry.name }))
  const categoryChoices = [
    { value: UNCATEGORIZED, label: 'Uncategorized' },
    ...(categories.data?.categories ?? [])
      .filter((entry) => entry.archivedAt === null)
      .map((entry) => ({ value: entry.id, label: entry.name })),
  ]
  const filtering = Object.keys(transactionQuery(filters, todayCalendarString())).length > 0

  // The forms wait for the vocabulary AND the Household: composing minor
  // units under the USD fallback's exponent would store a wrong amount for
  // a zero- or three-exponent Currency (ADR 0006).
  if (
    form !== null &&
    me.data !== undefined &&
    accounts.data !== undefined &&
    categories.data !== undefined
  ) {
    // Closing is all this has to do: the write's own mutation already
    // invalidated everything derived from the Ledger (api/query-keys.ts),
    // so the list behind the form is refetching before it reappears.
    const done = () => setForm(null)
    return form.kind === 'transfer' ? (
      <TransferForm
        entry={form.entry}
        accounts={accounts.data.accounts}
        currency={currency}
        dateFormat={dateFormat}
        onDone={done}
        onClose={done}
      />
    ) : (
      <TransactionForm
        entry={form.entry}
        accounts={accounts.data.accounts}
        categories={categories.data.categories}
        currency={currency}
        dateFormat={dateFormat}
        onDone={done}
        onClose={done}
      />
    )
  }

  const entries = transactions.data?.transactions ?? []
  // One scale for the visible ledger: the bars answer "how does this
  // compare to the rest of what I'm looking at", so they rescale with the
  // filters rather than against some absolute the screen never shows.
  const bars = railBars(
    entries.map((entry) => ({
      amount: entry.amount,
      neutral: entry.kind === 'transfer' || entry.kind === 'balance_adjustment',
    })),
  )

  return (
    // Titled for the tab that opens it. The two writes sit on their own row
    // rather than in the header: at "New transfer" and "New transaction"
    // they no longer fit beside a title, and shortening them to "Transfer"
    // and "New" cost more than the row does — neither said what it made.
    <ListScreen title="Ledger" back={false}>
      <View className="gap-2.5">
        <View className="flex-row gap-2">
          {/* A Transfer needs two Accounts to move between. */}
          {accountChoices.length > 1 && (
            <Button
              className="flex-1"
              variant="outline"
              onPress={() => setForm({ kind: 'transfer', entry: null })}
            >
              New transfer
            </Button>
          )}
          <Button className="flex-1" onPress={() => setForm({ kind: 'transaction', entry: null })}>
            New transaction
          </Button>
        </View>
        <SearchField value={filters.q} onChange={(q) => setFilters((f) => ({ ...f, q }))}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search descriptions" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <ChipRow
          choices={[
            { value: 'expense', label: 'Expenses' },
            { value: 'income', label: 'Income' },
          ]}
          value={filters.view}
          onChange={(view) =>
            setFilters((f) => ({ ...f, view: view === 'expense' || view === 'income' ? view : '' }))
          }
        />
        <ChipRow
          choices={PERIOD_CHOICES}
          value={filters.period}
          onChange={(period) =>
            setFilters((f) => ({ ...f, period: isPeriodPreset(period) ? period : '' }))
          }
        />
        {accountChoices.length > 1 && (
          <ChipRow
            choices={accountChoices}
            value={filters.accountId}
            onChange={(accountId) => setFilters((f) => ({ ...f, accountId }))}
          />
        )}
        <ChipRow
          choices={categoryChoices}
          value={filters.categoryId}
          onChange={(categoryId) => setFilters((f) => ({ ...f, categoryId }))}
        />
      </View>
      {error !== null || !loaded || transactions.data === undefined ? (
        <ListStatus error={error} retry={retry} />
      ) : entries.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          emptyTitle={filtering ? 'No matches' : 'Nothing here yet'}
          empty={
            filtering
              ? 'No transactions match these filters. Clear one to widen the ledger.'
              : 'Log your first transaction and the ledger starts here.'
          }
        />
      ) : (
        <Rail className="flex-1">
          <FlatList
            data={entries}
            keyExtractor={(entry) => entry.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: tabBarInset }}
            renderItem={({ item, index }) => {
              const bar = bars[index]
              return bar === undefined ? null : (
                <TransactionRow
                  entry={item}
                  currency={currency}
                  dateFormat={dateFormat}
                  accountNames={accountNames}
                  categoryNames={categoryNames}
                  bar={bar}
                  index={index}
                  onPress={() =>
                    setForm(
                      item.transferId !== null
                        ? { kind: 'transfer', entry: { ...item, transferId: item.transferId } }
                        : { kind: 'transaction', entry: item },
                    )
                  }
                />
              )
            }}
          />
        </Rail>
      )}
    </ListScreen>
  )
}
