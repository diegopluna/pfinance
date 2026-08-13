import { Redirect, router } from 'expo-router'
import { Button, Typography } from 'heroui-native'
import { useState, type JSX } from 'react'
import { View } from 'react-native'
import { authClientFor } from '@/auth/client'
import { Screen } from '@/components/screen'
import { forgetServerUrl, storedServerUrl } from '@/connect/store'

// The settings shell (issue #77): the connection is never a black box — the
// screen shows which Server the app talks to and offers the two ways out.
// Both revoke the session server-side first (the seam test in
// apps/server/test/integ.test.ts pins that transport) and only then forget
// the Server, so a failed sign-out leaves the app connected and says so.
// Switch-Server IS sign-out followed by the connect flow — the app holds one
// Server at a time, so there is nothing softer to offer.
export default function SettingsScreen(): JSX.Element {
  const apiUrl = storedServerUrl()
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
    <Screen>
      <View className="gap-2">
        <Typography.Heading type="h2">Settings</Typography.Heading>
        <Typography.Paragraph color="muted">Connected to</Typography.Paragraph>
        <Typography.Paragraph type="body-sm">{apiUrl}</Typography.Paragraph>
      </View>

      <View className="gap-3">
        <Typography.Paragraph type="body-sm" color="muted">
          This app holds one Server at a time. Switching to a different Server signs you out of this
          one first.
        </Typography.Paragraph>
        <Button variant="outline" isDisabled={busy} onPress={() => void signOut()}>
          {busy ? 'Signing out…' : 'Switch Server'}
        </Button>
        <Button variant="danger" isDisabled={busy} onPress={() => void signOut()}>
          Sign out
        </Button>
        {error !== null && (
          <Typography.Paragraph type="body-sm" className="text-danger">
            {error}
          </Typography.Paragraph>
        )}
        <Button variant="ghost" isDisabled={busy} onPress={() => router.back()}>
          Back
        </Button>
      </View>
    </Screen>
  )
}
