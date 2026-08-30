import { expoClient } from '@better-auth/expo/client'
import { createAuthClient } from 'better-auth/react'
import * as SecureStore from 'expo-secure-store'

// The Better Auth client for the connected Server (issue #77). The Expo
// plugin keeps the session cookie in the device secure store and replays it
// on every auth call, and sends the app's custom scheme as the expo-origin
// header — the exact scheme the Server trusts (apps/server/src/origins.ts);
// session semantics stay identical to web (7-day rolling expiry, ADR 0005).
//
// The base URL is a runtime value — whichever Server the user connected —
// so this is a factory, not a module-level client. Memoized on the URL: the
// app holds one Server at a time, and the client caches session state.
const scheme = 'goblin' // app.json's scheme; getOrigin() turns it into goblin://

const buildClient = (apiUrl: string) =>
  createAuthClient({
    baseURL: apiUrl,
    plugins: [
      expoClient({
        scheme,
        storagePrefix: scheme,
        storage: SecureStore,
      }),
    ],
  })

export type AuthClient = ReturnType<typeof buildClient>

let cached: { apiUrl: string; client: AuthClient } | null = null

export const authClientFor = (apiUrl: string): AuthClient => {
  if (cached?.apiUrl !== apiUrl) {
    cached = { apiUrl, client: buildClient(apiUrl) }
  }
  return cached.client
}

// The stored session cookie, '' when none is live — the launch gate's
// signed-in signal, and what API calls replay as their cookie header.
// (The Expo plugin drops expired entries on read, and sign-out's response
// deletes the stored cookie, so '' tracks "no usable session".)
export const sessionCookie = (apiUrl: string): string => authClientFor(apiUrl).getCookie()
