import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthForm } from '@/components/auth-form'
import { api } from '@/lib/api'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/sign-in')({
  head: () => ({ meta: [{ title: 'Sign in · Goblin' }] }),
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession()
    if (session) {
      throw redirect({ to: '/' })
    }
    // A pristine instance has nobody to sign in: the first visit belongs to
    // the bootstrap sign-up (ADR 0004), so send it there. sign-up-status is
    // only open while zero Users exist. If the check fails, stay here — the
    // sign-in form is the safe default.
    let signUpOpen = false
    try {
      const response = await api.api['sign-up-status'].$get()
      signUpOpen = response.ok && (await response.json()).allowed
    } catch {
      signUpOpen = false
    }
    if (signUpOpen) {
      throw redirect({ to: '/sign-up' })
    }
  },
  component: () => <AuthForm mode="sign-in" />,
})
