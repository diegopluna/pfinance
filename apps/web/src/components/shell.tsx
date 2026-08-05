import { Outlet, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@pfinance/ui/components/button'
import { api } from '@/lib/api'
import { authClient } from '@/lib/auth-client'

// The signed-in frame every feature screen renders inside (the /_authed
// layout); child routes land in the Outlet.
export function Shell() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await api.api.me.$get()
      if (!response.ok) {
        throw new Error('Failed to load household')
      }
      return response.json()
    },
  })

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
