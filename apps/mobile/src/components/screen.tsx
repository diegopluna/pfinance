import type { JSX, ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Wordmark } from '@/components/wordmark'

// The one screen shell for the connect flow: full-height theme background,
// safe-area insets, keyboard avoidance, a single left-aligned column.
// className is uniwind-mapped on core and HeroUI components, but
// SafeAreaView is a plain native view — className passed to it is silently
// dropped, so it takes a style prop and the theme background lives on the
// outer core View.
//
// The column is bottom-weighted rather than centered: these screens are a
// sequence of one question each, and a question that always starts at the
// same height reads as one surface being answered instead of five screens
// flashing past. The mark sits above it, so the app says who it is exactly
// where it is asking to be trusted with a Server address.
export function Screen({ children }: { children: ReactNode }): JSX.Element {
  return (
    <View className="flex-1 bg-background">
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View className="flex-1 justify-end gap-7 px-6 pt-10 pb-8">
            <View className="flex-1 justify-end pb-2">
              <Wordmark />
            </View>
            {children}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}
