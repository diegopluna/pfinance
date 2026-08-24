import { Redirect, router } from 'expo-router'
import { Button, Description, Input, Label, TextField } from 'heroui-native'
import { useState, type JSX } from 'react'
import { View } from 'react-native'
import { sessionCookie } from '@/auth/client'
import { Screen } from '@/components/screen'
import { Body, Title } from '@/components/type'
import { storedServerUrl } from '@/connect/store'
import { launchTarget } from '@/shell/route'

// The launch gate runs once per app process: it is what makes the session
// survive relaunch (issue #77). Later navigations back to '/' — "Use a
// different Server", post-sign-out — must render the connect screen itself,
// so the gate must not re-fire then.
let launchGateDone = false

// The connect entry (issue #76): Goblin is self-hosted, so before anything
// else the app must be pointed at a Server — typed by hand or scanned from
// the QR code the web app shows under Settings. Both paths land on /status,
// which runs the shared probe.
export default function ConnectScreen(): JSX.Element {
  // Lazy initial state so the secure store is read once, not per render.
  const [launch] = useState(() => {
    if (launchGateDone) return null
    launchGateDone = true
    const serverUrl = storedServerUrl()
    return launchTarget(serverUrl, serverUrl === null ? '' : sessionCookie(serverUrl))
  })
  const [address, setAddress] = useState('')
  const trimmed = address.trim()

  if (launch !== null && launch !== '/') return <Redirect href={launch} />

  const submit = () => {
    if (trimmed === '') return
    router.push({ pathname: '/status', params: { input: trimmed } })
  }

  return (
    <Screen>
      <View className="gap-2.5">
        <Title size="lg">Connect to your Server</Title>
        <Body tone="muted">
          Goblin is self-hosted: this app talks to your own Server and nobody else&apos;s.
        </Body>
      </View>

      <TextField>
        <Label>Server address</Label>
        <Input
          value={address}
          onChangeText={setAddress}
          placeholder="my-server.example.com"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="url"
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Description>Your web app&apos;s address works here too.</Description>
      </TextField>

      <View className="gap-3">
        <Button isDisabled={trimmed === ''} onPress={submit}>
          Connect
        </Button>
        <Button variant="outline" onPress={() => router.push('/scan')}>
          Scan QR code
        </Button>
        <Body size="sm" tone="muted" className="text-center">
          The QR code is in the web app, under Settings → Mobile app.
        </Body>
      </View>
    </Screen>
  )
}
