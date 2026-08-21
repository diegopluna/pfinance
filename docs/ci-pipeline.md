# CI & PR previews (optional)

Your fork ships with a GitHub Actions workflow
(`.github/workflows/deploy.yml`) that tests every change and deploys a
preview instance per pull request.

> [!NOTE]
> **This pipeline is optional.** Hosting pfinance does not require it. If you
> only want to run the app, follow the [quickstart](quickstart.md) and stop
> there — the workflow simply fails (or can be deleted) until its secrets are
> configured, and neither affects your deployed instance.

## What it does

On every pull request and every push to `master`:

1. **Test** — `vp check` (format, lint, type check) and the integration test
   suite, which deploys an isolated `test-*` stage and destroys it
   afterwards.
2. **Deploy** — pull requests deploy an isolated `pr-N` preview stage and
   comment the web and API preview URLs on the PR; branch pushes deploy a
   stage named after the branch (`master` pushes deploy a `master` stage —
   never `prod`, which is reserved for your manually deployed instance).
3. **Cleanup** — closing a PR destroys its `pr-N` preview stage (and any
   leftover `test-pr-N` stage).

> [!NOTE]
> **CI does not deploy the instance you claimed.** The quickstart deploys
> `--stage prod`. The pipeline never touches that stage from a `master` push,
> and it never sets `WEB_ORIGIN`, so your claimed instance stays under your
> control: keep updating it with the deploy command from
> [quickstart step 7](quickstart.md#7-harden-for-production).
>
> The alternative is to treat the CI-deployed `master` stage itself as your
> production instance — claim that one and skip the manual deploys entirely.
> The [custom domains section](#custom-domains-for-a-ci-hosted-production)
> below covers putting it on your own domain.

> [!WARNING]
> CI preview stages are fresh instances too, so each one is claimable until
> someone signs up — the same
> [claim warning](quickstart.md#6-claim-your-instance-immediately) from the
> quickstart applies. Previews are torn down when the PR closes.

## Enabling it on your fork

The workflow needs two repository Actions secrets: `CLOUDFLARE_API_TOKEN`
and `CLOUDFLARE_ACCOUNT_ID`.

### Option A: bootstrap them automatically

`vp run deploy` runs a small setup stack (`stacks/github.ts`) that mints a
scoped Cloudflare API token and writes both secrets into your repository. It
detects the repository from `GITHUB_REPOSITORY` or your clone's `origin`
remote, and errors if neither is available. Run it with whatever Alchemy
profile holds your Cloudflare and GitHub credentials:

```sh
ALCHEMY_PROFILE=admin vp run deploy
```

### Option B: set them by hand

Create the token as in the
[quickstart](quickstart.md#4-cloudflare-credentials) and add both values
under _Settings → Secrets and variables → Actions_ in your GitHub
repository.

## Custom domains for a CI-hosted production

If the CI-deployed `master` stage is your production instance, put it on
your own domain with repository Actions **variables** (not secrets): under
_Settings → Secrets and variables → Actions → Variables_, define either of
`WEB_DOMAIN` and `API_DOMAIN` — the same hostnames described in
[quickstart step 8](quickstart.md#8-production-urls-optional), and the zone
must already exist in your Cloudflare account.

The workflow forwards them **only on pushes to `master`**, together with
`PROD_STAGE=master` to satisfy the stack's production-stage guard. Pull
request previews never receive them, so a `pr-N` stage can never claim your
production hostnames. The next push to `master` attaches the domains, and
`WEB_ORIGIN` pins itself to `https://$WEB_DOMAIN` on the same deploy.

## Turning it off

Delete `.github/workflows/deploy.yml` from your fork, or just never
configure the secrets. Nothing about hosting depends on the pipeline.
