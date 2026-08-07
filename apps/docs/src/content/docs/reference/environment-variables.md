---
title: Environment variables
description: Every deployer-facing environment variable, its default, and its effect.
---

Every variable a deployer can set, what it defaults to, and what it changes.
All of them are read at **deploy time** by the Alchemy stack
(`alchemy.run.ts`) — none need to be configured inside Cloudflare.

## Deploy-time variables

| Variable                                  | Default                                                           | Effect                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                    | — (required)                                                      | Authenticates `alchemy` commands against the Cloudflare API. See the [quickstart](/guides/quickstart/#4-cloudflare-credentials) for the permissions it needs.                                                                                                                                                                            |
| `CLOUDFLARE_ACCOUNT_ID`                   | — (required)                                                      | The Cloudflare account all resources are created in.                                                                                                                                                                                                                                                                                     |
| `CLOUDFLARE_API_KEY` + `CLOUDFLARE_EMAIL` | Unset                                                             | Alchemy's legacy alternative to `CLOUDFLARE_API_TOKEN` — a global API key and the account email. It works, but a global key can do anything to your account; prefer the scoped token.                                                                                                                                                    |
| `WEB_ORIGIN`                              | Unset                                                             | Pins the browser origin the API trusts for credentialed requests. Unset, the API trusts any `*.workers.dev` origin — fine for dev and previews; set it on production deploys ([quickstart step 7](/guides/quickstart/#7-harden-for-production)). `http://localhost:3000` stays trusted either way, so local dev works against any stage. |
| `ALCHEMY_PROFILE`                         | `default`                                                         | Which stored Alchemy credentials profile to use. The `--profile` flag on any `alchemy` command wins over the variable.                                                                                                                                                                                                                   |
| `GITHUB_REPOSITORY`                       | Parsed from the clone's `origin` remote (`github.com` hosts only) | The `owner/repo` targeted by the GitHub-touching steps (PR preview comment, [CI secrets bootstrap](/guides/ci-pipeline/)). GitHub Actions sets it automatically. Remotes on other hosts are ignored, so mirrors must set it explicitly; a malformed value is an error.                                                                   |
| `PULL_REQUEST`                            | Unset                                                             | A PR number. When set, the deploy posts a comment with the preview URLs on that PR — this needs a detectable repository and a GitHub token. Set by the [CI pipeline](/guides/ci-pipeline/); never needed for hosting.                                                                                                                    |
| `GITHUB_TOKEN` / `GITHUB_ACCESS_TOKEN`    | Unset (or credentials from `alchemy login`)                       | GitHub credential for the PR preview comment and the CI secrets bootstrap. Resolved lazily: a deploy that touches no GitHub resource never asks for it.                                                                                                                                                                                  |

## Not environment variables — on purpose

- **`--stage <name>`** — the deploy stage is always passed explicitly as a
  flag, never via an env var: `prod` for your instance, `pr-N` for CI
  previews, `test-*` for the integration suite.
- **`BETTER_AUTH_SECRET`** — signs session cookies, but is deliberately not
  configurable: it is minted once per stage on first deploy and persisted in
  Alchemy state, so there is no secret to manage and no fallback value in the
  repo. Replacing the resource rotates it, signing every session out.
- **`VITE_API_URL`** — the web app's API endpoint is derived from the
  deployed API worker's URL during the build; never set it by hand.
- **`SIGNUPS_ENABLED` does not exist** — self-serve sign-up is permanently
  locked with a bootstrap exception (see the
  [claim warning](/guides/quickstart/#6-claim-your-instance-immediately)); there is
  no switch to open it (ADR 0004).

## GitHub Actions secrets (optional pipeline only)

The [CI pipeline](/guides/ci-pipeline/) needs two repository secrets —
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` — with the same meaning as
the deploy-time variables above. Nothing else needs configuring: the workflow
computes `STAGE`, `TEST_STAGE`, and `PULL_REQUEST` itself, and Actions
provides `GITHUB_REPOSITORY` and `GITHUB_TOKEN`.
