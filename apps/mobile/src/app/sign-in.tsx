import { router, useLocalSearchParams } from 'expo-router'
import { Button, Typography } from 'heroui-native'
import type { JSX } from 'react'
import { View } from 'react-native'
import { Screen } from '@/components/screen'

// Where a successful connect lands. A placeholder on purpose: this ticket
// (issue #76) ends the flow here; the real email+password sign-in against
// `apiUrl` arrives with the auth ticket.
export default function SignInScreen(): JSX.Element {
  const { apiUrl } = useLocalSearchParams<{ apiUrl?: string }>()

  return (
    <Screen>
      <View className="gap-2">
        <Typography.Heading type="h2">Sign in</Typography.Heading>
        <Typography.Paragraph color="muted">
          Use the same email and password as on the web. Signing in from the app isn&apos;t wired up
          yet — it lands in an upcoming update.
        </Typography.Paragraph>
        {apiUrl !== undefined && (
          <Typography.Paragraph type="body-sm" color="muted">
            Connected to {apiUrl}
          </Typography.Paragraph>
        )}
      </View>
      <Button variant="ghost" onPress={() => router.dismissTo('/')}>
        Use a different Server
      </Button>
    </Screen>
  )
}
