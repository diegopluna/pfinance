// Per-weight subpaths, not the package index: importing the index pulls a
// require() of every TTF the family ships — italics and weights this app
// never sets — and Metro bundles all of them.
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular'
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium'
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold'
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono/400Regular'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useFonts } from 'expo-font'
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { HeroUINativeProvider, useThemeColor } from 'heroui-native'
import { useEffect, useState, type JSX, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { createQueryClient, persistOptions, trackAppStateFocus } from '@/api/query-client'

import '../global.css'

// The type has to be in memory before the first frame: a screen that paints
// in the system face and reflows into Geist is a worse first launch
// than a splash screen held for a few hundred milliseconds. The keys here
// are the family names src/global.css binds to `--font-*`, so a rename has
// to happen in both places.
void SplashScreen.preventAutoHideAsync()

export default function RootLayout(): JSX.Element | null {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
  })
  // A font that fails to load is not a reason to hold the app hostage —
  // React Native falls back to the system face and every screen still works.
  const ready = fontsLoaded || fontError !== null
  // One client for the app's lifetime; created in state so a Fast Refresh
  // re-render can't drop the cache mid-session.
  const [queryClient] = useState(createQueryClient)

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync()
  }, [ready])
  useEffect(trackAppStateFocus, [])

  if (!ready) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Persistence restores the last-known ledger before the network
          answers — offline reads, issue #83; mutations never persist
          (api/query-client.ts). */}
      <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
        <HeroUINativeProvider>
          <NavigationTheme>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
          </NavigationTheme>
        </HeroUINativeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  )
}

// The navigator's own theme, handed the app's background. Native tabs
// (src/app/(tabs)/_layout.tsx) let the system draw the bar and derive it
// from the content behind it, and without this the frame underneath is
// react-navigation's default white — which flashes on every tab switch in
// dark mode. It has to sit inside HeroUINativeProvider to read the token.
function NavigationTheme({ children }: { children: ReactNode }): JSX.Element {
  const scheme = useColorScheme()
  const [background] = useThemeColor(['background'])
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background } }}>
      {children}
    </ThemeProvider>
  )
}
