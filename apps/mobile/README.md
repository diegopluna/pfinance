# mobile

The pfinance companion app (issue #70): an Expo app, published to the app
stores under one canonical listing, that connects to whichever self-hosted
Server the user points it at.

Scaffolded with `create-heroui-native-app` — Expo Router + HeroUI Native,
styled via Uniwind + Tailwind v4 (independent of the web-only `@pfinance/ui`
package). Metro picks up the pnpm workspace automatically.

## Running it

From this directory (or with `pnpm --filter mobile run <script>`):

```bash
pnpm start   # Metro bundler
pnpm ios     # iOS simulator
pnpm android # Android emulator
```

## What's here so far

The connect flow (issue #76): type a Server address or scan the pairing QR
code from the web app's settings, and the shared probe in
`@pfinance/api-client` classifies the URL into one of five connection states
(ADR 0007), each rendered as its own screen. A successful connect ends at a
sign-in placeholder.

The app renders the probe's states but owns none of the logic. Its only
logic on top — the state → screen copy mapping and the supported apiVersion
range in `src/connect/content.ts` — is node-testable and covered by
`test/connect-content.test.ts`, which runs with `vp test` from the workspace
root.
