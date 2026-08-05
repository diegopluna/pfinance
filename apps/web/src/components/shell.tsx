import { Link, Outlet, useNavigate } from '@tanstack/react-router'
import { Button } from '@pfinance/ui/components/button'
import { authClient } from '@/lib/auth-client'
import { useMe } from '@/hooks/use-me'

// The signed-in frame every feature screen renders inside (the /_authed
// layout); child routes land in the Outlet.
export function Shell() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const { data: me } = useMe()

  const handleSignOut = async () => {
    await authClient.signOut()
    await navigate({ to: '/sign-in' })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold">pfinance</span>
          {me && <span className="text-sm text-muted-foreground">{me.household.name}</span>}
          {/* Managing Members and Invites is owner-only (issue #6), so the
              nav entry only shows for the owner. */}
          {me?.role === 'owner' && (
            <nav className="ml-3 flex items-baseline gap-3 text-sm">
              <Link
                to="/"
                className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
              >
                Overview
              </Link>
              <Link
                to="/members"
                className="text-muted-foreground hover:text-foreground [&.active]:text-foreground"
              >
                Members
              </Link>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{session?.user.email}</span>
          <Button variant="outline" size="sm" onClick={() => void handleSignOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <Outlet />
      </main>
    </div>
  )
}
