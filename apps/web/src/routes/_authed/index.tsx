import { createFileRoute, Link } from '@tanstack/react-router'
import type { InferResponseType } from 'hono/client'
import { ACCOUNT_TYPES } from '@pfinance/db/account-types'
import { formatAmount, isSupportedCurrency, type CurrencyCode } from '@pfinance/currency'
import { Badge } from '@pfinance/ui/components/badge'
import { buttonVariants } from '@pfinance/ui/components/button'
import { Card, CardContent } from '@pfinance/ui/components/card'
import { api } from '@/lib/api'
import { NetWorthChart } from '@/components/net-worth-chart'
import { useAccounts } from '@/hooks/use-accounts'
import { useMe } from '@/hooks/use-me'
import { useNetWorth } from '@/hooks/use-net-worth'

export const Route = createFileRoute('/_authed/')({
  component: Dashboard,
})

const typeLabels = new Map<string, string>(ACCOUNT_TYPES.map(({ type, label }) => [type, label]))

type AccountEntry = InferResponseType<typeof api.api.accounts.$get, 200>['accounts'][number]

// The dashboard (issue #16): the signed-in landing view. Its first section is
// the per-Account Balances; the net worth and spending charts extend the page
// as sibling sections. Everything shown is read through the same
// /api/accounts surface the Accounts screen manages — Balances arrive
// server-derived (ADR 0001), active Accounts only.
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

  const accounts = accountsQuery.data?.accounts ?? []

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        {me !== undefined && (
          <p className="max-w-prose text-sm text-muted-foreground">
            {me.household.name} · amounts in {currency}
          </p>
        )}
      </div>

      <section aria-labelledby="balances-heading" className="flex flex-col gap-3">
        <h2 id="balances-heading" className="text-sm font-semibold tracking-tight">
          Balances
        </h2>
        {accountsQuery.isError || meQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t load accounts.
          </p>
        ) : accountsQuery.isPending || currency === undefined ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-start gap-1">
            <p className="max-w-prose text-sm text-muted-foreground">
              Nothing to show yet. Add accounts to start the ledger — transactions, net worth, and
              spending charts build on them.
            </p>
            <Link
              to="/accounts"
              className={buttonVariants({ variant: 'outline', className: 'mt-2' })}
            >
              Go to accounts
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((entry) => (
              <BalanceCard key={entry.id} entry={entry} currency={currency} />
            ))}
          </div>
        )}
      </section>

      <NetWorthSection query={netWorthQuery} currency={currency} />
    </div>
  )
}

// The monthly Net Worth line (issue #17), server-derived like the Balances
// above. The current value — the series' last point — rides the header as
// text: the endpoint label the chart itself stays too quiet to carry.
function NetWorthSection({
  query,
  currency,
}: {
  query: ReturnType<typeof useNetWorth>
  currency: CurrencyCode | undefined
}) {
  const series = query.data?.series ?? []
  const current = series.at(-1)
  return (
    <section aria-labelledby="net-worth-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="net-worth-heading" className="text-sm font-semibold tracking-tight">
          Net worth
        </h2>
        {current !== undefined && currency !== undefined && (
          <p className="text-sm font-semibold tracking-tight tabular-nums">
            {formatAmount(current.netWorth, currency)}
          </p>
        )}
      </div>
      {query.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load net worth.
        </p>
      ) : query.isPending || currency === undefined ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      ) : series.length === 0 ? (
        // No Accounts yet: the Balances section above already carries the
        // call to action, so this stays a quiet one-liner.
        <p className="max-w-prose text-sm text-muted-foreground">
          The chart starts with the ledger — it appears once there are accounts.
        </p>
      ) : (
        <Card size="sm">
          <CardContent>
            <NetWorthChart series={series} currency={currency} />
          </CardContent>
        </Card>
      )}
    </section>
  )
}

// One active Account's derived Balance. Liabilities read as debt at a glance
// via the LIABILITY badge — the Accounts screen's design language for the
// same distinction.
function BalanceCard({ entry, currency }: { entry: AccountEntry; currency: CurrencyCode }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{entry.name}</span>
          <Badge>
            {entry.kind === 'liability' ? 'Liability' : (typeLabels.get(entry.type) ?? entry.type)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{typeLabels.get(entry.type) ?? entry.type}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
          {formatAmount(entry.balance, currency)}
        </p>
      </CardContent>
    </Card>
  )
}
