import type { ApiClient } from '@pfinance/api-client'
import type { CurrencyCode } from '@pfinance/currency'
import type { DateFormat } from '@pfinance/db/date-formats'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { Chip, SearchField } from 'heroui-native'
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
import { IconButton } from '@/components/icon-button'
import { ListScreen, ListStatus } from '@/components/list-screen'
import { QuickAddSheet } from '@/components/quick-add-sheet'
import { MagBar } from '@/components/rail'
import { TransactionForm } from '@/components/transaction-form'
import { TransferForm } from '@/components/transfer-form'
import { Touchable } from '@/components/touchable'
import { Badge, Body } from '@/components/type'
import { storedServerUrl } from '@/connect/store'
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
// from/to bounds, and description search. The list gets the space: search
// collapses into a header icon, and the secondary filters sit behind one
// Filter chip beside the period presets. Capture happens in the quick-add
// sheet (issue #80) behind the header's +; tapping a row still opens the
// full form in place — the sheet is for capture, the forms are for
// correction — and a Transfer leg opens the Transfer form, since the pair
// can never drift (issue #81).

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
      <View className="flex-row items-start gap-3 border-separator border-t py-3">
        <View className="flex-1 gap-1">
          <Body numberOfLines={1} className="font-medium">
            {entry.description}
          </Body>
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
        {/* The row's measurement column: how much, which way, against the
            same axis every visible row is measured on. */}
        <View className="pt-2">
          <MagBar bar={bar} index={index} />
        </View>
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
  const [filters, setFilters] = useState<TransactionFilters>(noFilters)
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreFilters, setMoreFilters] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // The in-place form's target for EDITS: tapping a row opens the full
  // form; a Transfer leg opens the Transfer form — the pair can never
  // drift, so legs are only edited through their Transfer (issue #81).
  const [form, setForm] = useState<
    | { kind: 'transaction'; entry: TransactionEntry }
    | { kind: 'transfer'; entry: TransactionEntry & { transferId: string } }
    | null
  >(null)
  // ?new=true (home's +) opens capture on arrival — the param is the
  // trigger, so closing the sheet doesn't reopen it.
  const { new: openNew } = useLocalSearchParams<{ new?: string }>()
  useEffect(() => {
    if (openNew === 'true') setSheetOpen(true)
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
  // The Filter chip stays visibly active while any of the filters it hides
  // is set, so a filtered list can never look unfiltered.
  const hiddenActive = filters.view !== '' || filters.accountId !== '' || filters.categoryId !== ''

  // The form waits for the vocabulary AND the Household: composing minor
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
    <ListScreen
      title="Ledger"
      back={false}
      action={
        <View className="flex-row items-center gap-2.5">
          <IconButton
            glyph="search"
            label="Search descriptions"
            onPress={() => {
              setSearchOpen((open) => {
                if (open) setFilters((f) => ({ ...f, q: '' }))
                return !open
              })
            }}
          />
          <IconButton
            glyph="plus"
            label="New transaction"
            prominent
            onPress={() => setSheetOpen(true)}
          />
        </View>
      }
    >
      <View className="gap-2.5">
        {searchOpen && (
          <SearchField value={filters.q} onChange={(q) => setFilters((f) => ({ ...f, q }))}>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Search descriptions" autoFocus />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        )}
        <View className="flex-row items-center gap-2">
          <FilterChip
            label="Filter"
            active={moreFilters || hiddenActive}
            onPress={() => setMoreFilters((open) => !open)}
          />
          <View className="h-5 w-px bg-separator" />
          <ChipRow
            choices={PERIOD_CHOICES}
            value={filters.period}
            onChange={(period) =>
              setFilters((f) => ({ ...f, period: isPeriodPreset(period) ? period : '' }))
            }
          />
        </View>
        {(moreFilters || hiddenActive) && (
          <>
            <ChipRow
              choices={[
                { value: 'expense', label: 'Expenses' },
                { value: 'income', label: 'Income' },
              ]}
              value={filters.view}
              onChange={(view) =>
                setFilters((f) => ({
                  ...f,
                  view: view === 'expense' || view === 'income' ? view : '',
                }))
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
          </>
        )}
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
        <FlatList
          className="flex-1"
          data={entries}
          keyExtractor={(entry) => entry.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
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
      )}
      <QuickAddSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        accounts={accountChoices}
        categories={categoryChoices.filter((choice) => choice.value !== UNCATEGORIZED)}
        currency={currency}
      />
    </ListScreen>
  )
}
