import { call, type ApiClient } from '@pfinance/api-client'
import type { CurrencyCode } from '@pfinance/currency'
import type { DateFormat } from '@pfinance/db/date-formats'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { Button, Chip, SearchField, Typography } from 'heroui-native'
import type { InferResponseType } from 'hono/client'
import { useCallback, useEffect, useState, type JSX } from 'react'
import { FlatList, Pressable, ScrollView, View } from 'react-native'
import { apiFor } from '@/api/client'
import { useHousehold } from '@/api/use-household'
import { useApiQuery } from '@/api/use-query'
import { Amount } from '@/components/amount'
import { ListScreen, ListStatus } from '@/components/list-screen'
import { TransactionForm } from '@/components/transaction-form'
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
// from/to bounds, and description search. Amounts render through the ledger
// display rules (ledger/display.ts): a Transfer leg or Balance Adjustment
// is visibly badged and never reads as an ordinary entry. Quick entry
// (issue #80) lives here too: New and tapping a row open the form in place
// of the list, so the edited entry never has to survive a route change.

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
  onPress,
}: {
  entry: TransactionEntry
  currency: CurrencyCode
  dateFormat: DateFormat
  accountNames: Map<string, string>
  categoryNames: Map<string, string>
  // Absent for a Transfer leg: the pair can never drift, so legs are edited
  // through their Transfer (issue #81's surface, the web today).
  onPress?: () => void
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
    <Pressable onPress={onPress} disabled={onPress === undefined}>
      <View className="flex-row items-start justify-between gap-3 border-b border-separator py-3">
        <View className="flex-1 gap-1">
          <Typography.Paragraph numberOfLines={1} className="font-medium">
            {entry.description}
          </Typography.Paragraph>
          <Typography.Paragraph type="body-sm" color="muted">
            {formatCalendarDate(entry.date, dateFormat)} ·{' '}
            {accountNames.get(entry.accountId) ?? 'Unknown account'} · {category}
          </Typography.Paragraph>
          {badge !== null && (
            <View className="flex-row">
              <Chip size="sm" variant="soft" color="default">
                <Chip.Label>{badge}</Chip.Label>
              </Chip>
            </View>
          )}
        </View>
        <Amount amount={ledgerAmount(entry.kind, entry.amount, currency)} />
      </View>
    </Pressable>
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
  // The quick-entry form's target: null = closed, { entry: null } = create,
  // { entry } = edit. ?new=true (home's "New transaction") opens create on
  // arrival — the param is the trigger, so closing the form doesn't reopen.
  const [form, setForm] = useState<{ entry: TransactionEntry | null } | null>(null)
  const { new: openNew } = useLocalSearchParams<{ new?: string }>()
  useEffect(() => {
    if (openNew === 'true') setForm({ entry: null })
  }, [openNew])

  const { me, currency, dateFormat } = useHousehold(apiUrl)
  // Archived Accounts and Categories still name existing rows, so both
  // lookups load the full vocabulary (the web transactions screen's stance).
  const fetchAccounts = useCallback(
    () =>
      call(
        apiFor(apiUrl ?? '').api.accounts.$get({ query: { includeArchived: 'true' } }),
        'Could not load your Accounts.',
      ),
    [apiUrl],
  )
  const fetchCategories = useCallback(
    () =>
      call(
        apiFor(apiUrl ?? '').api.categories.$get({ query: { includeArchived: 'true' } }),
        'Could not load your Categories.',
      ),
    [apiUrl],
  )
  // The filters state object's identity changes exactly when a filter does,
  // so it is the fetch callback's cache key.
  const fetchTransactions = useCallback(
    () =>
      call(
        apiFor(apiUrl ?? '').api.transactions.$get({
          query: transactionQuery(filters, todayCalendarString()),
        }),
        'Could not load your Transactions.',
      ),
    [apiUrl, filters],
  )

  const skip = apiUrl === null
  const accounts = useApiQuery(skip ? null : fetchAccounts)
  const categories = useApiQuery(skip ? null : fetchCategories)
  const transactions = useApiQuery(skip ? null : fetchTransactions)

  if (apiUrl === null) return <Redirect href="/" />

  const accountNames = new Map(
    (accounts.data?.accounts ?? []).map((entry) => [entry.id, entry.name]),
  )
  const categoryNames = new Map(
    (categories.data?.categories ?? []).map((entry) => [entry.id, entry.name]),
  )

  const queries = [me, accounts, categories, transactions]
  const error = queries.find((query) => query.error !== null)?.error ?? null
  const retry = () => {
    for (const query of queries) if (query.error !== null) query.retry()
  }
  const loaded = queries.every((query) => query.data !== null)

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

  // The form waits for the vocabulary AND the Household: composing minor
  // units under the USD fallback's exponent would store a wrong amount for
  // a zero- or three-exponent Currency (ADR 0006).
  if (form !== null && me.data !== null && accounts.data !== null && categories.data !== null) {
    return (
      <TransactionForm
        apiUrl={apiUrl}
        entry={form.entry}
        accounts={accounts.data.accounts}
        categories={categories.data.categories}
        currency={currency}
        dateFormat={dateFormat}
        onDone={() => {
          setForm(null)
          transactions.retry()
        }}
        onCategoryCreated={() => categories.retry()}
        onClose={() => setForm(null)}
      />
    )
  }

  return (
    <ListScreen
      title="Transactions"
      action={
        <Button size="sm" onPress={() => setForm({ entry: null })}>
          New
        </Button>
      }
    >
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
      {error !== null || !loaded || transactions.data === null ? (
        <ListStatus error={error} retry={retry} />
      ) : transactions.data.transactions.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          empty={
            filtering
              ? 'No transactions match these filters.'
              : 'No transactions yet — the ledger fills up from the web app.'
          }
        />
      ) : (
        <FlatList
          data={transactions.data.transactions}
          keyExtractor={(entry) => entry.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TransactionRow
              entry={item}
              currency={currency}
              dateFormat={dateFormat}
              accountNames={accountNames}
              categoryNames={categoryNames}
              onPress={item.kind === 'transfer' ? undefined : () => setForm({ entry: item })}
            />
          )}
        />
      )}
    </ListScreen>
  )
}
