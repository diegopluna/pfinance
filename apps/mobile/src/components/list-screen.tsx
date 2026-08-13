import { router } from 'expo-router'
import { Button, Spinner, Typography } from 'heroui-native'
import type { JSX, ReactNode } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// The screen shell for the list screens (issue #78): top-aligned so a
// FlatList owns the remaining height, unlike Screen's centered column. Same
// SafeAreaView caveat as screen.tsx — className is silently dropped on it,
// so the theme background lives on the outer core View.
export function ListScreen({
  title,
  children,
}: {
  title: string
  children: ReactNode
}): JSX.Element {
  return (
    <View className="flex-1 bg-background">
      <SafeAreaView style={{ flex: 1 }}>
        <View className="flex-1 gap-4 px-6 pt-2">
          <View className="flex-row items-center justify-between">
            <Typography.Heading type="h2">{title}</Typography.Heading>
            <Button variant="ghost" size="sm" onPress={() => router.back()}>
              Back
            </Button>
          </View>
          {children}
        </View>
      </SafeAreaView>
    </View>
  )
}

// The three fetch states every list screen shares. The error state keeps
// the home screen's wording: the Server connection is intact, the request
// just failed — offer retry, never restart the connect flow.
export function ListStatus({
  error,
  retry,
  empty,
}: {
  error: string | null
  retry: () => void
  empty?: string
}): JSX.Element {
  if (error !== null) {
    return (
      <View className="items-center gap-3 py-12">
        <Typography.Paragraph color="muted" align="center">
          {error}
        </Typography.Paragraph>
        <Button variant="outline" onPress={retry}>
          Try again
        </Button>
      </View>
    )
  }
  if (empty !== undefined) {
    return (
      <View className="items-center py-12">
        <Typography.Paragraph color="muted" align="center">
          {empty}
        </Typography.Paragraph>
      </View>
    )
  }
  return (
    <View className="items-center py-12">
      <Spinner size="lg" />
    </View>
  )
}
