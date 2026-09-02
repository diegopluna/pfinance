import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { InferResponseType } from 'hono/client'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { ACCOUNT_TYPES, needsLiabilityMarker } from '@pfinance/db/account-types'
import { formatAmount, isSupportedCurrency, type CurrencyCode } from '@pfinance/currency'
import { Button, buttonVariants } from '@pfinance/ui/components/button'
import { Card, CardContent } from '@pfinance/ui/components/card'
import { api } from '@/lib/api'
import { IncomeVsExpenseChart } from '@/components/income-vs-expense-chart'
import { MagBar } from '@/components/mag-bar'
import { NetWorthChart } from '@/components/net-worth-chart'
import { useAccounts } from '@/hooks/use-accounts'
import { useIncomeExpense } from '@/hooks/use-income-expense'
import { useMe } from '@/hooks/use-me'
import { useNetWorth } from '@/hooks/use-net-worth'
import { useSpending } from '@/hooks/use-spending'
import { railBars } from '@/lib/rail'
import { addMonths, currentUtcMonth, monthLabel } from '@/lib/month'

export const Route = createFileRoute('/_authed/')({
  head: () => ({ meta: [{ title: 'Dashboard · pfinance' }] }),
  component: Dashboard,
})

const typeLabels = new Map<string, string>(ACCOUNT_TYPES.map(({ type, label }) => [type, label]))

type AccountEntry = InferResponseType<typeof api.api.accounts.$get, 200>['accounts'][number]

// The dashboard (issue #16) in the Claude Design 1b arrangement (docs/design/
// DECISIONS.md): the net-worth hero leads — value, delta vs the previous
// month, area chart — then a three-column row of accounts, income vs
// expense, and spending by category. Everything shown is read through the
// same /api surfaces the feature screens manage; balances and series arrive
// server-derived (ADR 0001).
function Dashboard() {
  const meQuery = useMe()
  const me = meQuery.data
  const accountsQuery = useAccounts(false)
  const netWorthQuery = useNetWorth()

  // Every amount renders in the Household Currency (ADR 0002), so no
  // Balance is shown before /api/me resolves — a fallback currency would
  // flash wrongly-formatted amounts when the accounts query wins the race.
  const currency: CurrencyCode | undefined =
    me !== undefined && isSupportedCurrency(me.household.currency)
      ? me.household.currency
      : undefined

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          {me !== undefined && (
            <p className="max-w-prose text-sm text-muted-foreground">
              {me.household.name} · amounts in {currency}
            </p>
          )}
        </div>
        {/* The 1b top-row action; ?new=true opens the transaction dialog on
            arrival, so the label keeps its promise. */}
        <Link
          to="/transactions"
          search={{ new: true }}
          className={buttonVariants({ className: 'shrink-0' })}
        >
          New transaction
        </Link>
      </div>

      <NetWorthHero query={netWorthQuery} currency={currency} />

      <div className="grid items-start gap-3.5 lg:grid-cols-3">
        <AccountsCard query={accountsQuery} meError={meQuery.isError} currency={currency} />
        <IncomeExpenseCard currency={currency} />
        <SpendingCard currency={currency} />
      </div>
    </div>
  )
}

// The 1b hero: the current value and its month-over-month delta as text the
// chart alone would keep too quiet, over the slot-1 area.
function NetWorthHero({
  query,
  currency,
}: {
  query: ReturnType<typeof useNetWorth>
  currency: CurrencyCode | undefined
}) {
  const series = query.data?.series ?? []
  const current = series.at(-1)
  const previous = series.at(-2)
  const delta =
    current !== undefined && previous !== undefined
      ? current.netWorth - previous.netWorth
      : undefined
  const pct =
    delta !== undefined && previous !== undefined && previous.netWorth !== 0
      ? Math.abs(delta / previous.netWorth)
      : undefined
  return (
    <section aria-labelledby="net-worth-heading">
      <Card>
        <CardContent className="flex flex-col">
          <h2 id="net-worth-heading" className="text-[12.5px] font-medium text-muted-foreground">
            Net worth
          </h2>
          {query.isError ? (
            <p role="alert" className="mt-1 text-sm text-destructive">
              Couldn&apos;t load net worth.
            </p>
          ) : query.isPending || currency === undefined ? (
            <p role="status" className="mt-1 text-sm text-muted-foreground">
              Loading…
            </p>
          ) : series.length === 0 ? (
            <div className="mt-1 flex flex-col items-start gap-1">
              {/* No Accounts yet — the whole product starts here, so the
                  hero carries the call to action. */}
              <p className="max-w-prose text-sm text-muted-foreground">
                Nothing to show yet. Add accounts to start the ledger — net worth, income, and
                spending build on them.
              </p>
              <Link
                to="/accounts"
                className={buttonVariants({ variant: 'outline', className: 'mt-2' })}
              >
                Go to accounts
              </Link>
            </div>
          ) : (
            <>
              <p className="text-[34px] font-bold tracking-[-0.02em] tabular-nums">
                {current !== undefined && formatAmount(current.netWorth, currency)}
              </p>
              {delta !== undefined && previous !== undefined && (
                <p
                  className={`text-[12.5px] font-semibold tabular-nums ${
                    delta < 0 ? 'text-destructive' : 'text-positive'
                  }`}
                >
                  <span aria-hidden>{delta < 0 ? '▼' : '▲'} </span>
                  <span className="sr-only">{delta < 0 ? 'Down' : 'Up'} </span>
                  {formatAmount(Math.abs(delta), currency)}
                  {pct !== undefined && (
                    <>
                      {' '}
                      (
                      {new Intl.NumberFormat(undefined, {
                        style: 'percent',
                        maximumFractionDigits: 1,
                      }).format(pct)}
                      )
                    </>
                  )}{' '}
                  <span className="font-medium text-muted-foreground">
                    vs {monthLabel(previous.month, 'month')}
                  </span>
                </p>
              )}
              <div className="mt-3.5">
                <NetWorthChart series={series} currency={currency} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

// One row per active Account, prototype-style: name over its type, derived
// Balance right-aligned. Liabilities read as debt via the "· liability"
// sub-line and their negative balance.
function AccountsCard({
  query,
  meError,
  currency,
}: {
  query: ReturnType<typeof useAccounts>
  meError: boolean
  currency: CurrencyCode | undefined
}) {
  const accounts = query.data?.accounts ?? []
  return (
    <section aria-labelledby="accounts-heading">
      <div className="flex flex-col rounded-xl bg-card px-4 py-3.5 shadow-lift">
        <h2 id="accounts-heading" className="text-[13px] font-semibold tracking-tight">
          Accounts
        </h2>
        {query.isError || meError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Couldn&apos;t load accounts.
          </p>
        ) : query.isPending || currency === undefined ? (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            Loading…
          </p>
        ) : accounts.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            No accounts yet — the hero above has the first step.
          </p>
        ) : (
          <AccountRows accounts={accounts} currency={currency} />
        )}
      </div>
    </section>
  )
}

// One scale for the whole plate (lib/rail.ts): a liability leans left for
// the same reason a grocery bill does — its Balance is negative, and no
// kind flips a sign (ADR 0001).
function AccountRows({ accounts, currency }: { accounts: AccountEntry[]; currency: CurrencyCode }) {
  const bars = railBars(accounts.map((entry) => ({ amount: entry.balance, neutral: false })))
  return (
    <ul className="flex flex-col">
      {accounts.map((entry, index) => {
        const bar = bars[index]
        return (
          <li
            key={entry.id}
            className="flex items-center justify-between gap-3 py-2 first:pt-1 last:pb-0"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium">{entry.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {typeLabels.get(entry.type) ?? entry.type}
                {needsLiabilityMarker(entry.type) && ' · liability'}
              </span>
            </span>
            <span className="text-[13.5px] font-semibold tabular-nums">
              {formatAmount(entry.balance, currency)}
            </span>
            {bar !== undefined && <MagBar bar={bar} track="background" />}
          </li>
        )
      })}
    </ul>
  )
}

// Income vs Expense by month (issue #19), server-summed over a recent window
// — the "am I saving anything" view. No month stepper: the window always ends
// at the current month, so the card reads as a standing answer rather than a
// browsable slice.
function IncomeExpenseCard({ currency }: { currency: CurrencyCode | undefined }) {
  const query = useIncomeExpense()
  const months = query.data?.months ?? []
  const latest = months.at(-1)
  return (
    <section aria-labelledby="income-expense-heading">
      <div className="flex flex-col rounded-xl bg-card px-4 py-3.5 shadow-lift">
        <h2 id="income-expense-heading" className="text-[13px] font-semibold tracking-tight">
          In vs out
        </h2>
        {query.isError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Couldn&apos;t load income vs expense.
          </p>
        ) : query.isPending || currency === undefined ? (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            Loading…
          </p>
        ) : months.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            The chart starts with the ledger — it appears once there are income or expense
            transactions.
          </p>
        ) : (
          <>
            <div className="mt-2">
              <IncomeVsExpenseChart months={months} currency={currency} />
            </div>
            {latest !== undefined && (
              <div className="mt-2 flex flex-col">
                <PairRow label="Money in" value={formatAmount(latest.income, currency)} />
                <PairRow label="Money out" value={formatAmount(latest.expense, currency)} />
                <div className="mt-1 border-border border-t pt-1.5">
                  <PairRow
                    label="Kept"
                    value={`${latest.income - latest.expense > 0 ? '+' : ''}${formatAmount(latest.income - latest.expense, currency)}`}
                    tone={latest.income - latest.expense < 0 ? 'negative' : 'positive'}
                  />
                </div>
              </div>
            )}
            {/* By definition (DECISIONS.md): every derived-spending card
                  carries this footnote visibly. */}
            <p className="mt-2.5 text-[11px] text-muted-foreground">
              Excludes transfers and adjustments
            </p>
          </>
        )}
      </div>
    </section>
  )
}

type SpendingSlice = InferResponseType<
  (typeof api.api)['spending-by-category']['$get'],
  200
>['slices'][number]

const SLOTS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

// Rank-ordered slot rows on tracks: colored slots walk spending rank
// (docs/design/DECISIONS.md); Uncategorized is always the neutral grey,
// never one of the five and never hidden. Identity stays in the row
// label, never in color alone.
function SpendingRows({ slices, currency }: { slices: SpendingSlice[]; currency: CurrencyCode }) {
  const max = Math.max(...slices.map((slice) => slice.total), 1)
  let slotIndex = 0
  return (
    <ul className="mt-1 flex flex-col">
      {slices.map((slice) => {
        const fill =
          slice.categoryId === null
            ? 'var(--chart-uncategorized)'
            : SLOTS[slotIndex++ % SLOTS.length]
        return (
          <li key={slice.categoryId ?? 'uncategorized'} className="flex flex-col py-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] font-medium">
                {slice.name ?? 'Uncategorized'}
              </span>
              <span className="text-[13.5px] font-semibold tabular-nums">
                {formatAmount(slice.total, currency)}
              </span>
            </div>
            <div className="relative mt-1.5 h-1 rounded-full bg-background">
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${(slice.total / max) * 100}%`, background: fill }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function PairRow({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative'
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span
        className={`text-[13.5px] font-semibold tabular-nums ${tone === 'negative' ? 'text-destructive' : tone === 'positive' ? 'text-positive' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}

// Spending by Category (issue #18), server-summed per month like every chart
// aggregate. The month selector is a stepper: unbounded in both directions,
// because the ledger is — a future-dated expense is as real as an old one,
// and a quiet month shows its empty state rather than being unreachable.
function SpendingCard({ currency }: { currency: CurrencyCode | undefined }) {
  const [month, setMonth] = useState(currentUtcMonth)
  const query = useSpending(month)
  const slices = query.data?.slices ?? []
  return (
    <section aria-labelledby="spending-heading">
      <div className="flex flex-col rounded-xl bg-card px-4 py-3.5 shadow-lift">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="spending-heading" className="text-[13px] font-semibold tracking-tight">
            Spending
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() => setMonth((current) => addMonths(current, -1))}
            >
              <ChevronLeftIcon aria-hidden />
            </Button>
            {/* aria-live: the month change a stepper click causes is
                  otherwise silent to a screen reader. */}
            <span aria-live="polite" className="min-w-24 text-center text-xs tabular-nums">
              {monthLabel(month, 'tick')}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              onClick={() => setMonth((current) => addMonths(current, 1))}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          </div>
        </div>
        {query.isError ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            Couldn&apos;t load spending.
          </p>
        ) : query.isPending || currency === undefined ? (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            Loading…
          </p>
        ) : slices.length === 0 ? (
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            No spending recorded in {monthLabel(month, 'full')}.
          </p>
        ) : (
          <>
            {/* The total is the sum of the bars: without it every row is
                  a share of something the card never states. */}
            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] text-muted-foreground">Total</span>
              <span className="text-[15px] font-semibold tabular-nums">
                {formatAmount(
                  slices.reduce((sum, slice) => sum + slice.total, 0),
                  currency,
                )}
              </span>
            </div>
            <SpendingRows slices={slices} currency={currency} />
            <p className="mt-2.5 text-[11px] text-muted-foreground">
              Excludes transfers and adjustments
            </p>
          </>
        )}
      </div>
    </section>
  )
}
