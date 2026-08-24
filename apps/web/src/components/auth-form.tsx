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
import { FieldDescription, FieldGroup } from '@pfinance/ui/components/field'
import { authClient } from '@/lib/auth-client'
import { focusFirstInvalid, useAppForm } from '@/hooks/form'

const currencyOptions = CURRENCIES.map(({ code, name }) => ({
  value: code,
  label: `${code} — ${name}`,
}))

export function AuthForm({
  mode,
  invite,
}: {
  mode: 'sign-in' | 'sign-up'
  // Present when the sign-up arrives through an Invite link: the recipient
  // joins the inviting Household, so no household name or currency is asked.
  invite?: { token: string; householdName: string }
}) {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useAppForm({
    defaultValues: { name: '', email: '', password: '', householdName: '', currency: '' },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      setServerError(null)
      // householdName/currency (or inviteToken) are extra sign-up fields the
      // server's user-create hook reads to build the new Household — or to
      // join the inviting one when redeeming an Invite. Passed via a variable
      // (not a literal) since the client's types don't know custom fields.
      const signUpBody = invite
        ? {
            name: value.name,
            email: value.email,
            password: value.password,
            inviteToken: invite.token,
          }
        : value
      const { error } =
        mode === 'sign-up'
          ? await authClient.signUp.email(signUpBody)
          : await authClient.signIn.email({ email: value.email, password: value.password })
      if (error) {
        setServerError(
          error.message ??
            (mode === 'sign-in'
              ? 'Unable to sign in. Check your connection and try again.'
              : 'Unable to create the account. Check your connection and try again.'),
        )
        return
      }
      await navigate({ to: '/' })
    },
  })

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          {/* Sign-up copy assumes the bootstrap state: without an Invite the
              form only renders while the instance has no owner (ADR 0004). */}
          <CardTitle>
            {mode === 'sign-in'
              ? 'Sign in'
              : invite
                ? invite.householdName
                  ? `Join ${invite.householdName}`
                  : 'Join the household'
                : 'Set up your household'}
          </CardTitle>
          <CardDescription>
            {mode === 'sign-in'
              ? 'Welcome back to Goblin.'
              : invite
                ? "You've been invited — create your account to join the household."
                : "You're the first user — this sign-up claims the instance and makes you the owner."}
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
                  {(field) => <field.TextField label="Your name" autoComplete="name" />}
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
              {mode === 'sign-up' && !invite && (
                <div className="flex flex-col gap-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <form.AppField
                      name="householdName"
                      validators={{
                        onSubmit: ({ value }) => (value.trim() ? undefined : 'Name your household'),
                      }}
                    >
                      {(field) => (
                        <field.TextField label="Household name" placeholder="Casa Peter" />
                      )}
                    </form.AppField>
                    {/* Chosen once, immutable afterwards (ADR 0002). */}
                    <form.AppField
                      name="currency"
                      validators={{
                        onSubmit: ({ value }) =>
                          isSupportedCurrency(value) ? undefined : 'Choose your currency',
                      }}
                    >
                      {(field) => (
                        <field.ComboboxField
                          label="Currency"
                          placeholder="Choose"
                          searchPlaceholder="Search currencies…"
                          emptyText="No currency found."
                          options={currencyOptions}
                          // The closed trigger shows just the code, like the
                          // sidebar's "BRL · 2 members".
                          renderValue={(code) => code}
                        />
                      )}
                    </form.AppField>
                  </div>
                  <FieldDescription>
                    Currency is set once per household — every account and transaction uses it.
                  </FieldDescription>
                </div>
              )}
              {serverError && (
                <p role="alert" className="text-sm text-destructive">
                  {serverError}
                </p>
              )}
              <form.AppForm>
                <form.SubmitButton>
                  {mode === 'sign-in' ? 'Sign in' : invite ? 'Join household' : 'Create household'}
                </form.SubmitButton>
              </form.AppForm>
            </FieldGroup>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'sign-in' ? (
              <>
                {/* Invite links are how anyone joins a claimed instance
                    (Claude Design 3a); the sign-up link still serves the
                    unclaimed bootstrap state. */}
                Have an invite link? Open it to join a household.
                <br />
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
