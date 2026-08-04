import { useEffect, useState } from 'react'
import { Button } from '@pfinance/ui/components/button'
import { authClient } from '@/lib/auth-client'

interface Me {
  user: { id: string; email: string; name: string }
  household: { id: string; name: string }
  role: 'owner' | 'member'
}

// The signed-in frame every feature screen will render inside.
export function Shell({ userEmail }: { userEmail: string }) {
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.VITE_API_URL}/api/me`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? (response.json() as Promise<Me>) : null))
      .then(setMe)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-semibold">pfinance</span>
          {me && <span className="text-sm text-muted-foreground">{me.household.name}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{userEmail}</span>
          <Button variant="outline" size="sm" onClick={() => void authClient.signOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground">
          Your household ledger will live here — accounts and transactions are coming next.
        </p>
      </main>
    </div>
  )
}
