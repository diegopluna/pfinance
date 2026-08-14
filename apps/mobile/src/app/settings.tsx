import { getCurrency, isSupportedCurrency } from '@pfinance/currency'
import { Redirect, router } from 'expo-router'
import { Button } from 'heroui-native'
import { useState, type JSX, type ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useHousehold } from '@/api/use-household'
import { authClientFor } from '@/auth/client'
import { ListScreen } from '@/components/list-screen'
import { Body, Eyebrow } from '@/components/type'
import { forgetServerUrl, storedServerUrl } from '@/connect/store'

// The settings shell (issue #77): the connection is never a black box — the
// screen shows which Server the app talks to, which Household that Server
// signed it into, and offers the two ways out. Both revoke the session
// server-side first (the seam test in apps/server/test/integ.test.ts pins
// that transport) and only then forget the Server, so a failed sign-out
// leaves the app connected and says so. Switch-Server IS sign-out followed
// by the connect flow — the app holds one Server at a time, so there is
// nothing softer to offer.

// "BRL · Brazilian Real" — the code always renders; the display name only
// for Currencies this build knows (a newer Server may know more).
const currencyLine = (code: string): string =>
  isSupportedCurrency(code) ? `${code} · ${getCurrency(code).name}` : code

export default function SettingsScreen(): JSX.Element {
  const apiUrl = storedServerUrl()
  const { me } = useHousehold(apiUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (apiUrl === null) return <Redirect href="/" />

  const signOut = async () => {
    setBusy(true)
    setError(null)
    const { error: failure } = await authClientFor(apiUrl).signOut()
    if (failure) {
      setBusy(false)
      setError(
        'Could not sign out — the Server was unreachable. Check your connection and try again.',
      )
      return
    }
    await forgetServerUrl()
    router.dismissTo('/')
  }

  return (
    <ListScreen title="Settings">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="gap-6 pb-4">
          <Section label="Server">
            {/* The address is a key, not prose: it is set in the figure
                voice so a typo in it is findable character by character. */}
            <Text className="font-mono text-[13px] text-foreground" selectable>
              {apiUrl}
            </Text>
          </Section>

          {me.data !== null && (
            <Section label="Household">
              <Body>{me.data.household.name}</Body>
              <Body size="sm" tone="muted">
                {currencyLine(me.data.household.currency)}
              </Body>
              <Body size="sm" tone="muted">
                Signed in as {me.data.user.email}
              </Body>
            </Section>
          )}

          <View className="gap-3 border-separator border-t pt-6">
            <Body size="sm" tone="muted">
              This app holds one Server at a time. Switching to a different Server signs you out of
              this one first.
            </Body>
            <Button variant="outline" isDisabled={busy} onPress={() => void signOut()}>
              {busy ? 'Signing out…' : 'Switch Server'}
            </Button>
            <Button variant="danger" isDisabled={busy} onPress={() => void signOut()}>
              Sign out
            </Button>
            {error !== null && (
              <Body size="sm" tone="danger">
                {error}
              </Body>
            )}
          </View>
        </View>
      </ScrollView>
    </ListScreen>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <View className="gap-1.5">
      <Eyebrow>{label}</Eyebrow>
      {children}
    </View>
  )
}
