import { AuthScreen } from '@/components/auth-screen'
import { Shell } from '@/components/shell'
import { authClient } from '@/lib/auth-client'

function App() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return <AuthScreen />
  }

  return <Shell userEmail={session.user.email} />
}

export default App
