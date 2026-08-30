import * as LocalAuthentication from 'expo-local-authentication'
import { Button } from 'heroui-native'
import { useCallback, useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { AppState, View, type AppStateStatus } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Wordmark } from '@/components/wordmark'
import { Body } from '@/components/type'
import { coverVisible, nextLockState, type LockState } from '@/shell/lock'
import { appLockEnabled } from '@/shell/lock-store'

// The app lock (issue #84): an optional gate over the cached financial
// data — cold start and every return from the background ask the platform
// to authenticate before the ledger shows. The transitions live in
// shell/lock.ts (tested); this component only wires them to AppState and
// LocalAuthentication and draws the cover: the connect flow's
// bottom-weighted shell — the mark, one quiet line, one verb — which also
// hides content whenever the app is not active, so the app switcher's
// snapshot captures the mark and never the numbers. The platform prompt
// fires by itself on return; the button is the retry after a cancel.
export function AppLockGate({ children }: { children: ReactNode }): JSX.Element {
  // A cold start with the lock on begins locked — the gate's whole point.
  const [state, setState] = useState<LockState>(() => (appLockEnabled() ? 'locked' : 'unlocked'))
  const [status, setStatus] = useState<AppStateStatus>(AppState.currentState)
  // The Face ID overlay flips AppState to inactive and back; the guard
  // keeps that round-trip from stacking a second prompt on the first.
  const prompting = useRef(false)

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      setStatus(next)
      // The preference is read fresh on every transition, so a switch
      // flipped in Settings takes effect on the next background without
      // this component ever subscribing to the store.
      setState((current) =>
        nextLockState(current, appLockEnabled(), { kind: 'app-state', status: next }),
      )
    })
    return () => subscription.remove()
  }, [])

  const unlock = useCallback(async () => {
    if (prompting.current) return
    prompting.current = true
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Goblin',
      })
      if (result.success) {
        setState((current) => nextLockState(current, appLockEnabled(), { kind: 'unlocked' }))
      }
    } finally {
      prompting.current = false
    }
  }, [])

  useEffect(() => {
    if (state === 'locked' && status === 'active') void unlock()
  }, [state, status, unlock])

  return (
    <View style={{ flex: 1 }}>
      {children}
      {coverVisible(state, appLockEnabled(), status) && (
        <View className="absolute inset-0 bg-background">
          <SafeAreaView style={{ flex: 1 }}>
            <View className="flex-1 justify-end gap-7 px-6 pb-8">
              <View className="gap-3">
                <Wordmark />
                <Body tone="muted" className="pt-2">
                  Locked. Your household&apos;s numbers stay hidden until you unlock.
                </Body>
              </View>
              <Button onPress={() => void unlock()}>Unlock</Button>
            </View>
          </SafeAreaView>
        </View>
      )}
    </View>
  )
}
