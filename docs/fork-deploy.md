# Deploying a fork

The deploy path contains no hardcoded repository or account values: a fork
deploys without editing source. This page records the defaults and the knobs
that override them (issue #20). The user-facing presentation lives in the
docs site (issue #21): `apps/docs/src/content/docs/guides/quickstart.md`,
`reference/environment-variables.md`, and `guides/ci-pipeline.md` — when a
default or knob changes, update those pages alongside this one.

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
| Production URLs        | Unset — each worker serves on its generated `*.workers.dev` URL                          | `WEB_DOMAIN` / `API_DOMAIN` / `DOCS_DOMAIN`, each a hostname attached to its worker as a Cloudflare custom domain      |
| Deploy stage           | None — always passed explicitly                                                          | `--stage <name>` (`prod`, `pr-N` previews, `test-*` for the integration suite)                                         |

The three `*_DOMAIN` variables set a worker's custom domain in
`alchemy.run.ts` — Alchemy manages the DNS record and edge certificate, and
infers the Cloudflare zone from the hostname, so the domain's zone must
already exist in the deploying account. When set, `https://<domain>` becomes
that worker's primary URL, so `VITE_API_URL` and the deploy's printed URLs
follow automatically. When unset, the prop is omitted, which per Alchemy
semantics leaves custom domains **unmanaged** rather than detaching them — a
later deploy without the variables keeps the domains attached, and CI
preview/test stages (which never set them) are unaffected. Pass the variables
on manual `--stage prod` deploys only.

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
