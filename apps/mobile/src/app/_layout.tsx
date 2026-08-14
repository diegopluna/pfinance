// Per-weight subpaths, not the package index: importing the index pulls a
// require() of every TTF the family ships — italics and weights this app
// never sets — and Metro bundles all of them.
import { SplineSansMono_400Regular } from '@expo-google-fonts/spline-sans-mono/400Regular'
import { SplineSansMono_500Medium } from '@expo-google-fonts/spline-sans-mono/500Medium'
import { SplineSansMono_600SemiBold } from '@expo-google-fonts/spline-sans-mono/600SemiBold'
import { SplineSans_400Regular } from '@expo-google-fonts/spline-sans/400Regular'
import { SplineSans_500Medium } from '@expo-google-fonts/spline-sans/500Medium'
import { SplineSans_600SemiBold } from '@expo-google-fonts/spline-sans/600SemiBold'
import { SplineSans_700Bold } from '@expo-google-fonts/spline-sans/700Bold'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { HeroUINativeProvider } from 'heroui-native'
import { useEffect, type JSX } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import '../global.css'

// The type has to be in memory before the first frame: a screen that paints
// in the system face and reflows into Spline Sans is a worse first launch
// than a splash screen held for a few hundred milliseconds. The keys here
// are the family names src/global.css binds to `--font-*`, so a rename has
// to happen in both places.
void SplashScreen.preventAutoHideAsync()

export default function RootLayout(): JSX.Element | null {
  const [fontsLoaded, fontError] = useFonts({
    SplineSans_400Regular,
    SplineSans_500Medium,
    SplineSans_600SemiBold,
    SplineSans_700Bold,
    SplineSansMono_400Regular,
    SplineSansMono_500Medium,
    SplineSansMono_600SemiBold,
  })
  // A font that fails to load is not a reason to hold the app hostage —
  // React Native falls back to the system face and every screen still works.
  const ready = fontsLoaded || fontError !== null

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])

  if (!ready) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HeroUINativeProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </HeroUINativeProvider>
    </GestureHandlerRootView>
  )
}
