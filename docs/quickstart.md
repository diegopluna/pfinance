# Fork & host quickstart

pfinance is forked and self-hosted: your Household's ledger runs in **your**
Cloudflare account, deployed from **your** fork. This guide takes you from a
fresh Cloudflare account to a running, claimed instance. No source edits are
needed — the deploy path carries no hardcoded repository or account values.

> [!CAUTION]
> **A fresh instance is claimable by whoever reaches it first.** Self-serve
> sign-up is permanently locked, with one exception: while an instance has
> **zero Users**, the first sign-up is accepted and that User becomes the
> owner of the first Household. That exception is how _you_ claim your
> deployment — but until you do, anyone who finds the URL can claim it
> instead. **Sign up immediately after deploying** (step 6).

## 1. Prerequisites

- A [GitHub](https://github.com) account, to fork the repository.
- A [Cloudflare](https://dash.cloudflare.com/sign-up) account — the free plan
  is enough (pfinance uses Workers, D1, and static assets).
- [Git](https://git-scm.com), to clone your fork.
- The [Vite+](https://viteplus.dev) CLI, `vp` — it manages the Node.js
  runtime and package manager for you, so nothing else needs installing:

  ```sh
  # macOS / Linux
  curl -fsSL https://vite.plus | bash
  ```

  On Windows, run `irm https://vite.plus/ps1 | iex` in PowerShell. Open a new
  shell afterwards, then check the install with `vp help`.

Hosting does **not** require any GitHub credentials or CI setup — the
[CI pipeline](ci-pipeline.md) is optional.

## 2. Fork and clone

Fork [`diegopluna/pfinance`](https://github.com/diegopluna/pfinance) on
GitHub, then clone your fork:

```sh
git clone https://github.com/<your-username>/pfinance.git
cd pfinance
```

## 3. Install dependencies

```sh
vp install
```

## 4. Cloudflare credentials

The deploy needs two values, both from the
[Cloudflare dashboard](https://dash.cloudflare.com):

1. **Account ID** — shown in the right-hand sidebar of the _Workers & Pages_
   overview page.
2. **API token** — under _My Profile → API Tokens_, create a custom token
   with account-scoped permissions. The set below is the one pfinance mints
   for its own CI token, so it is known to be sufficient; if a deploy ever
   fails on a permission, check `permissionGroups` in `stacks/github.ts`,
   which is the authoritative list. The dashboard labels write access as
   _Edit_:

   - Workers Scripts
   - D1
   - Workers KV Storage
   - Workers R2 Storage
   - Queues
   - Pages
   - Secrets Store
   - Account Settings
   - Workers Tail (read)

## 5. Deploy

From the repository root:

```sh
CLOUDFLARE_API_TOKEN=<your-token> CLOUDFLARE_ACCOUNT_ID=<your-account-id> \
  vpx alchemy deploy --stage prod --yes
```

The first deploy creates the D1 database, applies the schema migrations, and
deploys the API worker and the web app. When it finishes it prints two URLs:

- `webUrl` — the app itself
- `apiUrl` — the API worker

There is no session secret to manage: `BETTER_AUTH_SECRET` is minted on the
first deploy and persisted in Alchemy's state, so it survives redeploys
without any env var (see the
[environment reference](environment-variables.md)).

## 6. Claim your instance immediately

Open `webUrl` and **sign up immediately**. An instance with no Users sends
you straight to the sign-up screen; the account you create becomes the first
User and the owner of the first Household. From that moment self-serve
sign-up is closed, and the screen says so. To add other people to your
Household afterwards, issue Invites from the **Members** screen — an Invite
lets its recipient register even though sign-up is locked.

If you wait, whoever reaches the URL first claims your instance instead. If
that happens to a fresh deploy, destroy the stage and deploy again:

```sh
CLOUDFLARE_API_TOKEN=<your-token> CLOUDFLARE_ACCOUNT_ID=<your-account-id> \
  vpx alchemy destroy --stage prod --yes
```

> [!WARNING]
> `destroy` deletes the stage's D1 database along with everything else in it.
> It is the right move on a just-deployed instance with no data of yours in
> it, and the wrong one on an instance you have been using.

## 7. Harden for production

Out of the box the API trusts any `*.workers.dev` origin for credentialed
browser requests — fine for previews, broader than you want long-term. Pin it
to your web app's origin (the `webUrl` from step 5) and redeploy:

```sh
CLOUDFLARE_API_TOKEN=<your-token> CLOUDFLARE_ACCOUNT_ID=<your-account-id> \
  WEB_ORIGIN=https://<your-web-host> \
  vpx alchemy deploy --stage prod --yes
```

Pass `WEB_ORIGIN` on every subsequent deploy (or export it in the shell you
deploy from). If you move the app to a custom domain with `WEB_DOMAIN`
(step 8), `WEB_ORIGIN` defaults to that domain's origin and you can drop it.

## 8. Production URLs (optional)

Out of the box each worker serves on a generated `*.workers.dev` URL. If you
own a domain whose zone is already in your Cloudflare account, put your
instance on stable production URLs by passing a hostname per app:

```sh
CLOUDFLARE_API_TOKEN=<your-token> CLOUDFLARE_ACCOUNT_ID=<your-account-id> \
  WEB_DOMAIN=pfinance.example.com \
  API_DOMAIN=api.pfinance.example.com \
  vpx alchemy deploy --stage prod --yes
```

Each variable attaches its hostname to the matching worker as a Cloudflare
custom domain: the DNS record and edge certificate are created and managed
for you, and the deploy's printed URLs switch to the custom domains. The web
app is rebuilt against the API's new URL on the same deploy, and `WEB_ORIGIN`
defaults to `https://$WEB_DOMAIN`, so a custom-domain deploy is
origin-pinned without step 7's variable.

Both are independent — set only the ones you want. Like `WEB_ORIGIN`, pass
them on every subsequent deploy. A deploy without them leaves
already-attached domains in place (Alchemy treats the omitted setting as
unmanaged, not as a detach), but the web app would be rebuilt against the
API's `workers.dev` URL and the `WEB_ORIGIN` default would revert — so
exporting the variables in the shell you deploy from is the safest habit.

The variables only work on the production stage (`--stage prod` here): a
custom domain attaches to exactly one worker, so any other stage deploying
with them set would pull the domain off your production instance. The deploy
refuses with a clear error instead — if you hit it, unset the `*_DOMAIN`
variables for that deploy. (Hosting your production from CI instead of a
manual `prod` stage? Set them as repository Actions variables — see
[custom domains in the CI pipeline](ci-pipeline.md#custom-domains-for-a-ci-hosted-production).)

## Next steps

- Every deploy-time knob and its default:
  [environment reference](environment-variables.md).
- Want per-PR preview deployments on your fork? Set up the **optional**
  [CI pipeline](ci-pipeline.md). Hosting works fine without it.
- To update your instance later, pull the latest changes and run the same
  deploy command — migrations are generated and applied automatically.
