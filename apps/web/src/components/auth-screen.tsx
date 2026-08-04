import { useState } from 'react'
import { Button } from '@pfinance/ui/components/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pfinance/ui/components/card'
import { Input } from '@pfinance/ui/components/input'
import { Label } from '@pfinance/ui/components/label'
import { authClient } from '@/lib/auth-client'

type Mode = 'sign-in' | 'sign-up'

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    const form = new FormData(event.currentTarget)
    const field = (key: string) => {
      const value = form.get(key)
      return typeof value === 'string' ? value : ''
    }
    const email = field('email')
    const password = field('password')
    const { error: authError } =
      mode === 'sign-up'
        ? await authClient.signUp.email({ email, password, name: field('name') })
        : await authClient.signIn.email({ email, password })
    if (authError) {
      setError(authError.message ?? 'Something went wrong')
      setSubmitting(false)
    }
    // On success useSession refreshes and App switches to the shell.
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'sign-in' ? 'Sign in' : 'Create your Household'}</CardTitle>
          <CardDescription>
            {mode === 'sign-in'
              ? 'Welcome back to pfinance.'
              : 'Signing up creates you and your Household.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'sign-up' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required autoComplete="name" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {mode === 'sign-in' ? 'Sign in' : 'Sign up'}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'sign-in' ? (
              <>
                New here?{' '}
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => switchMode('sign-up')}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already signed up?{' '}
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => switchMode('sign-in')}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
