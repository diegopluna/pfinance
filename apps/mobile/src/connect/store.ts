import * as SecureStore from 'expo-secure-store'

// The connected Server (issue #77): the app holds exactly one at a time, in
// the device secure store next to the session cookie the Better Auth Expo
// client keeps there. Written only after a successful sign-in — a probe that
// merely reached a Server doesn't bind the app to it — and cleared by
// sign-out and switch-Server, which return the app to the connect flow.
const SERVER_URL_KEY = 'goblin_server_url'

export const storedServerUrl = (): string | null => SecureStore.getItem(SERVER_URL_KEY)

export const rememberServerUrl = (apiUrl: string): void => {
  SecureStore.setItem(SERVER_URL_KEY, apiUrl)
}

// Async because SecureStore has no synchronous delete.
export const forgetServerUrl = (): Promise<void> => SecureStore.deleteItemAsync(SERVER_URL_KEY)
