// The app shell's launch decision (issue #77): which screen the app opens
// on, from the two facts that persist across relaunches — the connected
// Server's URL (device secure store) and the session cookie the Better Auth
// Expo client keeps there. Pure on purpose: free of react-native imports so
// the workspace's node test runner covers it (apps/mobile/test), while the
// index gate just renders the returned route.
export type LaunchTarget = '/' | '/sign-in' | '/home'

export const launchTarget = (serverUrl: string | null, sessionCookie: string): LaunchTarget => {
  // No Server means nothing to sign in against — a stray cookie doesn't
  // change that. Sign-out and switch-Server both clear the stored Server,
  // so every post-sign-out launch starts over at connect.
  if (serverUrl === null || serverUrl === '') return '/'
  // Server intact but no live cookie: the 7-day rolling expiry lapsed
  // (ADR 0005). Ask for credentials again, not for the Server URL.
  if (sessionCookie === '') return '/sign-in'
  return '/home'
}
