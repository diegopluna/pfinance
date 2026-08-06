import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { ACCOUNT_TYPES } from '@pfinance/db/account-types'
import { formatAmount, isSupportedCurrency, type CurrencyCode } from '@pfinance/currency'
import { Badge } from '@pfinance/ui/components/badge'
import { buttonVariants } from '@pfinance/ui/components/button'
import { Card, CardContent } from '@pfinance/ui/components/card'
import { api } from '@/lib/api'
import { useMe } from '@/hooks/use-me'

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
  const { data: me } = useMe()

  // Every amount renders in the Household Currency (ADR 0002). The USD
  // fallback only covers the frame before /api/me resolves.
  const currency: CurrencyCode =
    me !== undefined && isSupportedCurrency(me.household.currency) ? me.household.currency : 'USD'

  // Same key as the Accounts screen's active-only list, so the two share one
  // cache entry and a mutation there refreshes the dashboard too.
  const accountsQuery = useQuery({
    queryKey: ['accounts', false],
    queryFn: async () => {
      const response = await api.api.accounts.$get({ query: { includeArchived: 'false' } })
      if (!response.ok) {
        throw new Error('Failed to load accounts')
      }
      return response.json()
    },
  })

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
        {accountsQuery.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading…
          </p>
        ) : accountsQuery.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Couldn&apos;t load accounts.
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
    </div>
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
