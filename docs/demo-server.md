# The demo Server

The demo Server (issue #85) is a stock Goblin deployment on its own `demo`
stage in the maintainer's Cloudflare account, seeded with a sample Household
and reset nightly. It exists for two audiences: store browsers who tap **Try
the demo** on the mobile connect screen, and App Review, whose notes carry
the same URL and credentials.

Forks don't need any of this — the demo entry hides itself while no demo
Server is configured in the app.

## How it works

- **The instance** is an ordinary deploy: `vpx alchemy deploy --stage demo
--yes`. No special flags, no demo mode in the server — the sample data is
  the only thing demo about it.
- **The seed** (`scripts/seed-demo.mjs`) drives the public HTTP API against
  a fresh deploy: the bootstrap sign-up (ADR 0004) claims the instance as
  the demo User, then accounts, five months of transactions, transfers, and
  a couple of deliberately Uncategorized rows (so the cleanup flow has
  something to show) go in through the same endpoints the apps use.
  Deterministic pseudo-randomness keeps every seed run identical.
- **The nightly reset** (`.github/workflows/demo-reset.yml`, 06:00 UTC)
  destroys the stage and deploys + seeds it again. Destroy-and-recreate
  rather than cleanup is the point: it also undoes anything a visitor did to
  the demo account itself — including changing its password. The stage's
  `workers.dev` URLs are derived from worker names, so they survive the
  cycle and the URL embedded in the app stays valid.
- **The app side** (`apps/mobile/src/connect/demo.ts`) embeds the demo URL
  and the shared credentials. Try the demo runs the ordinary probe
  (`/status`) and an auto-submitting sign-in — every failure falls back to
  the standard designed connection states.

## First-time setup (maintainer)

1. Deploy the stage once by hand and note the printed `apiUrl`:

   ```sh
   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
     vpx alchemy deploy --stage demo --yes
   ```

2. Seed it: `DEMO_API_URL=<apiUrl> node scripts/seed-demo.mjs`
3. Set the repository Actions **variable** `DEMO_API_URL` to the same URL
   (Settings → Secrets and variables → Actions → Variables) — the nightly
   workflow reads it; the Cloudflare secrets it uses are the ones the CI
   pipeline already has.
4. Stamp `DEMO_SERVER_URL` in `apps/mobile/src/connect/demo.ts` with the
   same URL — this is what makes the connect screen show the demo entry —
   and ship a new app build.

## Credentials

`demo@example.com` / `try-the-demo` — embedded in the app, defaulted in the
seed script, and quoted in App Review notes. They are not a secret; the
nightly reset is what keeps them honest.
