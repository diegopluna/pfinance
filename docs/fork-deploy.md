# Deploying a fork

The deploy path contains no hardcoded repository or account values: a fork
deploys without editing source. This page records the defaults and the knobs
that override them (issue #20). The user-facing presentation lives beside it
(issue #21): `docs/quickstart.md`, `docs/environment-variables.md`, and
`docs/ci-pipeline.md` — when a default or knob changes, update those pages
alongside this one.

## Hosting only (no CI, no previews)

The minimum deploy is Cloudflare credentials plus one command:

```sh
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
  vpx alchemy deploy --stage prod --yes
```

Nothing GitHub-related is touched: the PR preview comment only exists when
`PULL_REQUEST` is set, and GitHub credentials are resolved lazily — a plan
with no GitHub resource never asks for a token. The `.github/workflows/`
pipeline is optional; deleting it (or never configuring its secrets) does not
affect hosting.

## Defaults and overrides

| Value                  | Default                                                                                  | Override                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GitHub owner/repo      | Parsed from the clone's `origin` remote (github.com hosts only)                          | `GITHUB_REPOSITORY=owner/repo` (GitHub Actions sets this automatically)                                                |
| PR preview comment     | Skipped (with a logged warning if `PULL_REQUEST` is set but no repository is detectable) | Set `PULL_REQUEST=<pr-number>` and provide a GitHub token (`GITHUB_TOKEN` / `GITHUB_ACCESS_TOKEN`, or `alchemy login`) |
| Alchemy auth profile   | `default`                                                                                | `ALCHEMY_PROFILE=<name>`, or `--profile <name>` on any `alchemy` command (the flag wins)                               |
| Trusted browser origin | Unset — the API trusts `*.workers.dev` broadly (fine for dev/previews)                   | `WEB_ORIGIN=https://your-web-host` on production deploys (defaults to `https://$WEB_DOMAIN` when that is set)          |
| Production URLs        | Unset — each worker serves on its generated `*.workers.dev` URL                          | `WEB_DOMAIN` / `API_DOMAIN`, each a hostname attached to its worker as a Cloudflare custom domain                      |
| Production stage       | `prod` — the stage the `*_DOMAIN` variables are allowed on                               | `PROD_STAGE=<stage>` (CI sets it to the branch name on push deploys, for CI-hosted production via Actions variables)   |
| Deploy stage           | None — always passed explicitly                                                          | `--stage <name>` (`prod`, `pr-N` previews, `test-*` for the integration suite)                                         |

The two `*_DOMAIN` variables set a worker's custom domain in
`alchemy.run.ts` — Alchemy manages the DNS record and edge certificate, and
infers the Cloudflare zone from the hostname, so the domain's zone must
already exist in the deploying account. When set, `https://<domain>` becomes
that worker's primary URL, so `VITE_API_URL` and the deploy's printed URLs
follow automatically. When unset, the prop resolves to undefined, which per
Alchemy semantics leaves custom domains **unmanaged** rather than detaching
them — a later deploy without the variables keeps the domains attached, and
CI preview/test stages (which never set them) are unaffected.

The variables are **production-only, enforced**: a hostname attaches to
exactly one worker account-wide, so a dev/preview/test deploy that saw one of
these vars (say, exported in the deploying shell) would detach the domain
from the production instance. Both stacks therefore start by checking the
deploy's stage — before any resource is created — and fail loudly when a
`*_DOMAIN` variable is set on any stage other than the designated production
stage, instead of silently taking the domain over.

The production stage is `prod` (the quickstart's manual deploy) unless
`PROD_STAGE` designates another. That knob exists for CI-hosted production:
`deploy.yml` sets `PROD_STAGE` to the branch name on push deploys and
forwards the three `*_DOMAIN` values from repository Actions **variables**
(push events only — a `pr-N` preview never sees them), which is how this
repo's own instance, the CI-deployed `master` stage, carries its domains. A
fork that follows the quickstart never sets `PROD_STAGE` and never defines
the Actions variables, and nothing changes for it.

Repository detection lives in `stacks/repository.ts`: `GITHUB_REPOSITORY`
wins, then the `origin` remote URL (scp-like `git@`, `ssh://`, or `https://`
form); both yield `{ owner, repository }`. Remotes on hosts other than
github.com are ignored — a GitLab or Codeberg clone must not be mistaken for
the github.com repository that shares its slug, so mirrors set
`GITHUB_REPOSITORY` explicitly. A malformed `GITHUB_REPOSITORY` is an error,
never a silent skip.

## Optional: CI pipeline and PR previews

`.github/workflows/deploy.yml` deploys previews per PR and comments the
preview URLs on the PR. To enable it on a fork, the repository needs two
Actions secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

`vp run deploy` (the `stacks/github.ts` stack) bootstraps both: it mints a
scoped Cloudflare API token and writes the two secrets into the repository
detected as above. It errors if no repository is detectable, since writing
secrets needs a target. Run it as whatever Alchemy profile holds your
Cloudflare and GitHub credentials, e.g.:

```sh
ALCHEMY_PROFILE=admin vp run deploy
```

Setting the two secrets by hand in the GitHub UI works just as well.
