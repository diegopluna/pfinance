import { router } from 'expo-router'
import { Button, Description, Input, Label, TextField, Typography } from 'heroui-native'
import { useState, type JSX } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// The connect entry (issue #76): pfinance is self-hosted, so before anything
// else the app must be pointed at a Server — typed by hand or scanned from
// the QR code the web app shows under Settings. Both paths land on /status,
// which runs the shared probe.
//
// Layout note, here and in the sibling screens: className is uniwind-mapped
// on core and HeroUI components, but SafeAreaView is a plain native view —
// className passed to it is silently dropped, so it gets a style prop.
export default function ConnectScreen(): JSX.Element {
  const [address, setAddress] = useState('')
  const trimmed = address.trim()

  const submit = () => {
    if (trimmed === '') return
    router.push({ pathname: '/status', params: { input: trimmed } })
  }

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-1 justify-center gap-8 px-6">
            <View className="gap-2">
              <Typography.Heading type="h2">Connect to your Server</Typography.Heading>
              <Typography.Paragraph color="muted">
                pfinance is self-hosted: this app talks to your own Server and nobody else&apos;s.
              </Typography.Paragraph>
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
              <Typography.Paragraph type="body-sm" color="muted" align="center">
                The QR code is in the web app, under Settings → Mobile app.
              </Typography.Paragraph>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}
