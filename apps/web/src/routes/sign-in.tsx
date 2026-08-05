import { createFileRoute, redirect } from '@tanstack/react-router'
import { AuthForm } from '@/components/auth-form'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/sign-in')({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession()
    if (session) {
      throw redirect({ to: '/' })
    }
  },
  component: () => <AuthForm mode="sign-in" />,
})
