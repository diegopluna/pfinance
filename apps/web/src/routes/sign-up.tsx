import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pfinance/ui/components/card'
import { AuthForm } from '@/components/auth-form'
import { api } from '@/lib/api'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/sign-up')({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession()
    if (session) {
      throw redirect({ to: '/' })
    }
  },
  // Ask the server whether self-serve sign-up is open (SIGNUPS_ENABLED +
  // bootstrap exception, ADR 0004) so a locked instance explains itself
  // instead of failing on submit. If the check itself fails, show the form —
  // the server's auth hook still enforces the gate.
  loader: async (): Promise<{ allowed: boolean }> => {
    try {
      const response = await api.api['sign-up-status'].$get()
      return response.ok ? await response.json() : { allowed: true }
    } catch {
      return { allowed: true }
    }
  },
  component: SignUpScreen,
})

function SignUpScreen() {
  const { allowed } = Route.useLoaderData()
  if (allowed) {
    return <AuthForm mode="sign-up" />
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign-ups are closed</CardTitle>
          <CardDescription>
            This pfinance instance isn&apos;t accepting new sign-ups. Ask whoever runs it to enable
            them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/sign-in" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
