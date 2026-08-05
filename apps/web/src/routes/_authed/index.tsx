import { createFileRoute, Link } from '@tanstack/react-router'
import { buttonVariants } from '@pfinance/ui/components/button'

export const Route = createFileRoute('/_authed/')({
  component: Home,
})

// The dashboard's charts arrive with transactions (issues #8+); until then
// this is an empty state that points at the one thing that exists: Accounts.
function Home() {
  return (
    <div className="flex w-full flex-col items-start gap-1">
      <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        Nothing to show yet. Add accounts to start the ledger — transactions, net worth, and
        spending charts build on them.
      </p>
      <Link to="/accounts" className={buttonVariants({ variant: 'outline', className: 'mt-3' })}>
        Go to accounts
      </Link>
    </div>
  )
}
