import * as SecureStore from 'expo-secure-store'

// The app-lock preference (issue #84), in the device secure store beside
// the Server address (connect/store.ts) — this phone's lock, never the
// Household's: another member's phone decides for itself. Off by default:
// absence of the key IS the default, so a fresh install never asks.
const APP_LOCK_KEY = 'goblin_app_lock'

export const appLockEnabled = (): boolean => SecureStore.getItem(APP_LOCK_KEY) === 'on'

export const rememberAppLock = (enabled: boolean): void => {
  SecureStore.setItem(APP_LOCK_KEY, enabled ? 'on' : 'off')
}
