import { expect, test } from 'vite-plus/test'
import { launchTarget } from '../src/shell/route.ts'

// --- The app shell's launch decision (issue #77) ---
// Pure mapping from the two persisted facts — the connected Server's URL and
// the stored session cookie — to the screen the app opens on. Free of
// react-native imports so the workspace's node test runner covers it; the
// index gate renders whatever this returns.

test('no stored Server opens the connect flow', () => {
  // First launch, and every launch after sign-out or switch-Server: both
  // clear the stored Server, so the app starts over at connect.
  expect(launchTarget(null, '')).toBe('/')
  // A stray cookie without a Server to send it to still means connect —
  // there is nothing to sign in against.
  expect(launchTarget(null, 'better-auth.session_token=abc')).toBe('/')
})

test('a stored Server with a live session cookie opens home', () => {
  // The relaunch criterion: signing in persisted both facts, so the next
  // launch goes straight to home.
  expect(launchTarget('https://api.example.com', 'better-auth.session_token=abc')).toBe('/home')
})

test('a stored Server without a session cookie opens sign-in', () => {
  // The 7-day rolling expiry lapsed (ADR 0005): the Server connection is
  // intact, only the session is gone — ask for credentials again rather
  // than making the user re-run the connect flow.
  expect(launchTarget('https://api.example.com', '')).toBe('/sign-in')
})
