import { getCurrency, isSupportedCurrency } from '@pfinance/currency'
import { useQueryClient } from '@tanstack/react-query'
import { Redirect, router } from 'expo-router'
import { Button } from 'heroui-native'
import { useState, type JSX, type ReactNode } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useMe } from '@/api/use-me'
import { authClientFor } from '@/auth/client'
import { ListScreen } from '@/components/list-screen'
import { Body, SectionTitle } from '@/components/type'
import { queryPersister } from '@/api/query-client'
import { forgetServerUrl, storedServerUrl } from '@/connect/store'

// The settings shell (issue #77): the connection is never a black box — the
// screen shows which Server the app talks to, which Household that Server
// signed it into, and offers the two ways out. Both revoke the session
// server-side first (the seam test in apps/server/test/integ.test.ts pins
// that transport) and only then forget the Server, so a failed sign-out
// leaves the app connected and says so. Switch-Server IS sign-out followed
// by the connect flow — the app holds one Server at a time, so there is
// nothing softer to offer.

// "BRL · Brazilian Real · 2 members" — the code always renders; the display
// name only for Currencies this build knows (a newer Server may know more),
// and the member count says the ledger is shared, the way the web shell's
// identity line does.
const currencyLine = (code: string, members: number): string =>
  `${isSupportedCurrency(code) ? `${code} · ${getCurrency(code).name}` : code} · ${members} ${members === 1 ? 'member' : 'members'}`

export default function SettingsScreen(): JSX.Element {
  const apiUrl = storedServerUrl()
  const me = useMe()
  const queryClient = useQueryClient()
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
    // The cache is this Household's, and the app is about to belong to
    // another Server or none: keys carry no Server (api/query-keys.ts), so
    // the way they stay honest is that leaving empties them.
    queryClient.clear()
    await queryPersister.removeClient()
    router.dismissTo('/')
  }

  return (
    <ListScreen title="Settings" back={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        <View className="gap-6 pb-4">
          <Section label="Server">
            {/* The address is an operational identifier — the one place the
                mono voice appears — so a typo in it is findable character
                by character. */}
            <Text className="font-mono text-body-sm text-foreground" selectable>
              {apiUrl}
            </Text>
            {me.data !== undefined && (
              <View className="flex-row items-center gap-1.5">
                <View className="h-[7px] w-[7px] rounded-full bg-success" />
                <Body size="sm" tone="muted">
                  Connected · signed in as {me.data.user.email}
                </Body>
              </View>
            )}
          </Section>

          {me.data !== undefined && (
            <Section label="Household">
              <Body className="font-medium">{me.data.household.name}</Body>
              <Body size="sm" tone="muted">
                {currencyLine(me.data.household.currency, me.data.household.memberCount)}
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
      <SectionTitle>{label}</SectionTitle>
      {children}
    </View>
  )
}
