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

// Screen copy per rejection reason; the keys are the server's reason union,
// checked by the typed RPC response in the loader below.
const deadInviteCopy = {
  not_found: 'This invite link is not valid — check that you copied the whole link.',
  used: 'This invite has already been used. Ask the household owner for a new one.',
  revoked: 'This invite was revoked. Ask the household owner for a new one.',
  expired: 'This invite has expired. Ask the household owner for a new one.',
} as const

// The three ways this screen renders: self-serve sign-up (open only while
// the instance is unclaimed, ADR 0004), Invite redemption (?invite=token
// from a copy-paste link), or a dead Invite explaining itself.
type SignUpLoaderData =
  | { kind: 'self-serve'; allowed: boolean }
  | { kind: 'invite'; token: string; householdName: string }
  | { kind: 'dead-invite'; reason: keyof typeof deadInviteCopy }

export const Route = createFileRoute('/sign-up')({
  validateSearch: (search: Record<string, unknown>): { invite?: string } =>
    typeof search.invite === 'string' && search.invite !== '' ? { invite: search.invite } : {},
  loaderDeps: ({ search }) => ({ invite: search.invite }),
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession()
    if (session) {
      throw redirect({ to: '/' })
    }
  },
  // Ask the server up front — whether self-serve sign-up is open, or whether
  // the Invite link is still redeemable — so the screen explains itself
  // instead of failing on submit. If the check itself fails, show the form:
  // the auth hook stays the enforcement point (ADR 0004).
  loader: async ({ deps }): Promise<SignUpLoaderData> => {
    if (deps.invite !== undefined) {
      try {
        const response = await api.api['invite-info'].$get({ query: { token: deps.invite } })
        if (!response.ok) {
          return { kind: 'invite', token: deps.invite, householdName: '' }
        }
        const info = await response.json()
        return info.valid
          ? { kind: 'invite', token: deps.invite, householdName: info.householdName }
          : { kind: 'dead-invite', reason: info.reason }
      } catch {
        return { kind: 'invite', token: deps.invite, householdName: '' }
      }
    }
    try {
      const response = await api.api['sign-up-status'].$get()
      const { allowed } = response.ok ? await response.json() : { allowed: true }
      return { kind: 'self-serve', allowed }
    } catch {
      return { kind: 'self-serve', allowed: true }
    }
  },
  component: SignUpScreen,
})

function SignUpScreen() {
  const data = Route.useLoaderData()
  if (data.kind === 'invite') {
    return (
      <AuthForm mode="sign-up" invite={{ token: data.token, householdName: data.householdName }} />
    )
  }
  if (data.kind === 'self-serve' && data.allowed) {
    return <AuthForm mode="sign-up" />
  }
  const closedCopy =
    data.kind === 'dead-invite'
      ? deadInviteCopy[data.reason]
      : "This pfinance instance already has its owner and isn't accepting new sign-ups."
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {data.kind === 'dead-invite' ? 'This invite no longer works' : 'Sign-ups are closed'}
          </CardTitle>
          <CardDescription>{closedCopy}</CardDescription>
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
