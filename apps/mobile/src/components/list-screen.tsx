import { router } from 'expo-router'
import { Button, Spinner } from 'heroui-native'
import type { JSX, ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Chevron } from '@/components/chevron'
import { Body, Eyebrow, Title } from '@/components/type'

// The screen shell for everything behind sign-in: top-aligned so a list can
// own the remaining height. Same SafeAreaView caveat as screen.tsx —
// className is silently dropped on it, so the theme background lives on the
// outer core View.
//
// The chrome is one line: back, name, and the screen's one primary verb.
// Nothing is boxed. A phone screen is already a card, so drawing another
// one around its contents only narrows the ledger.
export function ListScreen({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string
  /** What this screen is a view of, when the title alone leaves it open. */
  eyebrow?: string
  action?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <View className="flex-1 bg-background">
      <SafeAreaView style={{ flex: 1 }}>
        <View className="flex-1 gap-4 px-5 pt-1">
          <View className="flex-row items-center gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
              onPress={() => router.back()}
              className="-ml-1 h-9 w-9 items-center justify-center"
            >
              <Chevron direction="left" size={18} />
            </Pressable>
            <View className="flex-1">
              {eyebrow !== undefined && <Eyebrow>{eyebrow}</Eyebrow>}
              <Title>{title}</Title>
            </View>
            {action}
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
      <View className="items-start gap-4 py-10">
        <Eyebrow tone="foreground">Request failed</Eyebrow>
        <Body tone="muted">{error}</Body>
        <Button variant="outline" onPress={retry}>
          Try again
        </Button>
      </View>
    )
  }
  if (empty !== undefined) {
    return (
      <View className="gap-3 py-10">
        {/* An empty screen states the rule that empties it, in the same
            voice the full screen would use. */}
        <Eyebrow>Nothing here yet</Eyebrow>
        <Body tone="muted">{empty}</Body>
      </View>
    )
  }
  return (
    <View className="items-start py-10">
      <Spinner size="lg" />
    </View>
  )
}
