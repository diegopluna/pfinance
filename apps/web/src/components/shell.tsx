import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { Button } from '@pfinance/ui/components/button'
import { authClient } from '@/lib/auth-client'
import { useMe } from '@/hooks/use-me'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')

const navLinkClass =
  'rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium text-muted-foreground hover:text-foreground [&.active]:bg-muted [&.active]:font-semibold [&.active]:text-foreground'

// The signed-in frame every feature screen renders inside (the /_authed
// layout); child routes land in the Outlet. Sidebar shell per Claude Design
// 2a–2f: logo + nav on the left, household identity pinned to the bottom.
export function Shell() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const { data: me } = useMe()

  const handleSignOut = async () => {
    await authClient.signOut()
    await navigate({ to: '/sign-in' })
  }

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-border bg-sidebar px-3 pt-5 pb-4">
        <div className="flex items-center gap-2.5 px-2.5 pb-4 text-[15px] font-semibold tracking-tight">
          <span className="size-5 rounded-md bg-foreground" />
          pfinance
        </div>
        <nav className="flex flex-col gap-0.5">
          <Link to="/" className={navLinkClass}>
            Dashboard
          </Link>
          {/* The ledger is every Member's (CONTEXT.md); managing Members and
              Invites is owner-only (issue #6). */}
          <Link to="/accounts" className={navLinkClass}>
            Accounts
          </Link>
          {me?.role === 'owner' && (
            <Link to="/members" className={navLinkClass}>
              Members
            </Link>
          )}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center gap-2.5 px-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[10.5px] font-semibold text-muted-foreground">
              {initials(session?.user.name ?? '')}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[12.5px] font-semibold">{me?.household.name}</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {me ? `${me.household.currency} · ${me.role}` : session?.user.email}
              </span>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start px-2.5 text-muted-foreground"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </Button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}
