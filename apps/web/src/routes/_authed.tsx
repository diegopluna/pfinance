import { createFileRoute, redirect } from '@tanstack/react-router'
import { Shell } from '@/components/shell'
import { authClient } from '@/lib/auth-client'

// Pathless layout: every signed-in screen nests under the Shell. The guard
// asks the server for the session, so a stale client can't slip through.
export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession()
    if (!session) {
      throw redirect({ to: '/sign-in' })
    }
  },
  component: Shell,
})
