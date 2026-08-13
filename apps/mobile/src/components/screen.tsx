import type { JSX, ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// The one screen shell for the connect flow: full-height theme background,
// safe-area insets, keyboard avoidance, centered content column. className
// is uniwind-mapped on core and HeroUI components, but SafeAreaView is a
// plain native view — className passed to it is silently dropped, so it
// takes a style prop and the theme background lives on the outer core View.
export function Screen({ children }: { children: ReactNode }): JSX.Element {
  return (
    <View className="flex-1 bg-background">
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-1 justify-center gap-8 px-6">{children}</View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}
