import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { Button, FieldError, Input, Label, TextField, Typography } from 'heroui-native'
import { useState, type JSX } from 'react'
import { View } from 'react-native'
import { authClientFor } from '@/auth/client'
import { Screen } from '@/components/screen'
import { rememberServerUrl, storedServerUrl } from '@/connect/store'

// Real sign-in (issue #77): the same email+password as the web, against the
// Server the connect flow just probed (the apiUrl param) — or the stored
// Server when the launch gate lands here after the session expired. The Expo
// auth client puts the session cookie in the device secure store; remembering
// the Server only on success is what makes this Server the app's connection.
export default function SignInScreen(): JSX.Element {
  const { apiUrl: probed } = useLocalSearchParams<{ apiUrl?: string }>()
  const apiUrl = probed ?? storedServerUrl()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Only reachable with a Server in hand (from /status or the launch gate).
  if (apiUrl === null || apiUrl === '') return <Redirect href="/" />

  const ready = email.trim() !== '' && password !== '' && !busy

  const submit = async () => {
    if (!ready) return
    setBusy(true)
    setError(null)
    const { error: failure } = await authClientFor(apiUrl).signIn.email({
      email: email.trim(),
      password,
    })
    if (failure) {
      setBusy(false)
      // Better Auth's message ("Invalid email or password") when it answered;
      // the fallback covers the Server being unreachable mid-sign-in.
      setError(
        failure.message ?? 'Could not reach the Server. Check your connection and try again.',
      )
      return
    }
    rememberServerUrl(apiUrl)
    // Clear the connect-flow screens from the stack first, so home becomes
    // the root — the back gesture must not resurface the probe.
    if (router.canDismiss()) router.dismissAll()
    router.replace('/home')
  }

  return (
    <Screen>
      <View className="gap-2">
        <Typography.Heading type="h2">Sign in</Typography.Heading>
        <Typography.Paragraph color="muted">
          Use the same email and password as on the web.
        </Typography.Paragraph>
        <Typography.Paragraph type="body-sm" color="muted">
          {apiUrl}
        </Typography.Paragraph>
      </View>

      <View className="gap-4">
        <TextField>
          <Label>Email</Label>
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />
        </TextField>
        <TextField isInvalid={error !== null}>
          <Label>Password</Label>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          <FieldError>{error}</FieldError>
        </TextField>
      </View>

      <View className="gap-3">
        <Button isDisabled={!ready} onPress={() => void submit()}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <Button variant="ghost" isDisabled={busy} onPress={() => router.dismissTo('/')}>
          Use a different Server
        </Button>
      </View>
    </Screen>
  )
}
