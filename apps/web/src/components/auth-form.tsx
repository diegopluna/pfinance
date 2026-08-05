import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { CURRENCIES, isSupportedCurrency } from '@pfinance/currency'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@pfinance/ui/components/card'
import { FieldGroup } from '@pfinance/ui/components/field'
import { authClient } from '@/lib/auth-client'
import { useAppForm } from '@/hooks/form'

const currencyOptions = CURRENCIES.map(({ code, name }) => ({
  value: code,
  label: `${code} — ${name}`,
}))

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { name: '', email: '', password: '', householdName: '', currency: '' },
    onSubmit: async ({ value }) => {
      setServerError(null)
      const { error } =
        mode === 'sign-up'
          ? // householdName and currency are extra sign-up fields; the
            // server's user-create hook builds the new Household from them.
            await authClient.signUp.email(value)
          : await authClient.signIn.email({ email: value.email, password: value.password })
      if (error) {
        setServerError(error.message ?? 'Something went wrong')
        return
      }
      await navigate({ to: '/' })
    },
  })

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
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <FieldGroup>
              {mode === 'sign-up' && (
                <form.AppField
                  name="name"
                  validators={{
                    onSubmit: ({ value }) => (value.trim() ? undefined : 'Enter your name'),
                  }}
                >
                  {(field) => <field.TextField label="Name" autoComplete="name" />}
                </form.AppField>
              )}
              <form.AppField
                name="email"
                validators={{
                  onSubmit: ({ value }) =>
                    /^[^\s@]+@[^\s@]+$/.test(value) ? undefined : 'Enter a valid email',
                }}
              >
                {(field) => <field.TextField label="Email" type="email" autoComplete="email" />}
              </form.AppField>
              <form.AppField
                name="password"
                validators={{
                  onSubmit: ({ value }) =>
                    value.length >= 8 ? undefined : 'Password must be at least 8 characters',
                }}
              >
                {(field) => (
                  <field.TextField
                    label="Password"
                    type="password"
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                  />
                )}
              </form.AppField>
              {mode === 'sign-up' && (
                <>
                  <form.AppField
                    name="householdName"
                    validators={{
                      onSubmit: ({ value }) => (value.trim() ? undefined : 'Name your household'),
                    }}
                  >
                    {(field) => <field.TextField label="Household name" placeholder="Casa Peter" />}
                  </form.AppField>
                  {/* Chosen once, immutable afterwards (ADR 0002): every
                      amount in the household is denominated in it. */}
                  <form.AppField
                    name="currency"
                    validators={{
                      onSubmit: ({ value }) =>
                        isSupportedCurrency(value) ? undefined : 'Choose your currency',
                    }}
                  >
                    {(field) => (
                      <field.SelectField
                        label="Currency"
                        placeholder="Choose a currency"
                        options={currencyOptions}
                      />
                    )}
                  </form.AppField>
                </>
              )}
              {serverError && <p className="text-sm text-destructive">{serverError}</p>}
              <form.AppForm>
                <form.SubmitButton>{mode === 'sign-in' ? 'Sign in' : 'Sign up'}</form.SubmitButton>
              </form.AppForm>
            </FieldGroup>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'sign-in' ? (
              <>
                New here?{' '}
                <Link to="/sign-up" className="text-primary underline-offset-4 hover:underline">
                  Sign up
                </Link>
              </>
            ) : (
              <>
                Already signed up?{' '}
                <Link to="/sign-in" className="text-primary underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
