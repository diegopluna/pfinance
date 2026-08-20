# mobile

The pfinance companion app (issue #70): an Expo app, published to the app
stores under one canonical listing, that connects to whichever self-hosted
Server the user points it at.

Scaffolded with `create-heroui-native-app` — Expo Router + HeroUI Native,
styled via Uniwind + Tailwind v4 (independent of the web-only `@pfinance/ui`
package). Metro picks up the pnpm workspace automatically.

## Running it — development builds, not Expo Go

The app runs in a **development build** (expo-dev-client). Expo Go cannot
run it: the config plugins in app.json (the camera permission string, the
Face ID entitlement for the app lock) and Face ID itself only exist in a
build that includes them. The native projects are generated, never
committed (/ios and /android are gitignored — continuous native
generation).

**Once per machine/device, build the dev client:**

```bash
pnpm run:ios      # local build → iOS simulator (needs Xcode)
pnpm run:android  # local build → Android emulator (needs Android Studio)
# or, without local toolchains, on EAS:
npx eas build --profile development --platform ios
```

Rebuild it only when native config changes — a new native module, a
changed plugin, an SDK upgrade. JS-only changes never need it.

**Every day after that:**

```bash
pnpm start   # Metro, serving the dev client
pnpm ios     # …and open it on the iOS simulator
pnpm android # …and open it on the Android emulator
```

## What's here so far

The connect flow (issue #76): type a Server address or scan the pairing QR
code from the web app's settings, and the shared probe in
`@pfinance/api-client` classifies the URL into one of five connection states
(ADR 0007), each rendered as its own screen.

Sign-in and the app shell (issue #77): a successful connect leads to real
email+password sign-in — the same credentials as the web, via the Better
Auth Expo client, with the session cookie kept in the device secure store —
and lands on a home screen showing the Household's name and Currency from
`/api/me`. The connected Server's URL persists in the secure store too, so
the session survives relaunch (the launch gate in `src/app/index.tsx`
decides connect vs sign-in vs home from the two stored facts). Settings
shows the Server URL and offers sign-out and switch-Server; both revoke the
session server-side and return to connect — the app holds one Server at a
time.

The app renders the probe's states but owns none of the logic. Its only
logic on top is node-testable and covered from the workspace root by
`vp test`: the state → screen copy mapping and the supported apiVersion
range (`src/connect/content.ts`, `test/connect-content.test.ts`), and the
launch-gate decision (`src/shell/route.ts`, `test/shell-route.test.ts`).
