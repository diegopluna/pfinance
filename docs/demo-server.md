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
- **The stable address is a custom domain.** A stage's `workers.dev` URLs
  carry a per-create suffix and do NOT survive destroy → recreate (verified
  empirically), so the URL the mobile app embeds must be a custom domain.
  The demo deploy passes `WEB_DOMAIN` / `API_DOMAIN` (this repo:
  `goblin-demo.dpeter.dev` / `goblin-demo-api.dpeter.dev`) with
  `PROD_STAGE=demo` to satisfy the stack's production-stage guard; Alchemy
  reattaches the hostnames — DNS record and certificate — to the fresh
  workers on every cycle. Setting `WEB_DOMAIN` also pins `WEB_ORIGIN`, so
  the demo API trusts exactly the demo web app's origin.
- **The seed** (`scripts/seed-demo.mjs`) drives the public HTTP API against
  a fresh deploy: the bootstrap sign-up (ADR 0004) claims the instance as
  the demo User, then accounts, five months of transactions, transfers, and
  a couple of deliberately Uncategorized rows (so the cleanup flow has
  something to show) go in through the same endpoints the apps use.
  Deterministic pseudo-randomness keeps every seed run identical. It
  presents the pinned web origin (`DEMO_WEB_ORIGIN`) to pass the CSRF
  origin check.
- **The nightly reset** (`.github/workflows/demo-reset.yml`, 06:00 UTC)
  destroys the stage and deploys + seeds it again. Destroy-and-recreate
  rather than cleanup is the point: it also undoes anything a visitor did to
  the demo account itself — including changing its password.
- **The app side** (`apps/mobile/src/connect/demo.ts`) embeds the demo URL
  and the shared credentials. Try the demo runs the ordinary probe
  (`/status`) and an auto-submitting sign-in — every failure falls back to
  the standard designed connection states.

## First-time setup (maintainer)

1. Deploy the stage once by hand, with the domains (their zone must already
   be in the Cloudflare account):

   ```sh
   PROD_STAGE=demo \
   WEB_DOMAIN=goblin-demo.dpeter.dev \
   API_DOMAIN=goblin-demo-api.dpeter.dev \
     vpx alchemy deploy --stage demo --yes
   ```

2. Seed it:

   ```sh
   DEMO_API_URL=https://goblin-demo-api.dpeter.dev \
   DEMO_WEB_ORIGIN=https://goblin-demo.dpeter.dev \
     node scripts/seed-demo.mjs
   ```

3. Set the repository Actions **variables** (Settings → Secrets and
   variables → Actions → Variables) the nightly workflow reads:
   `DEMO_WEB_DOMAIN`, `DEMO_API_DOMAIN`, and `DEMO_API_URL`
   (`https://<DEMO_API_DOMAIN>`). The Cloudflare secrets it uses are the
   ones the CI pipeline already has.
4. `DEMO_SERVER_URL` in `apps/mobile/src/connect/demo.ts` carries the same
   API URL — this is what makes the connect screen show the demo entry.

## Credentials

`demo@example.com` / `try-the-demo` — embedded in the app, defaulted in the
seed script, and quoted in App Review notes. They are not a secret; the
nightly reset is what keeps them honest.
