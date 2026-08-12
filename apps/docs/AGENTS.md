# pfinance docs site

Deployer-facing documentation for people who fork and self-host pfinance: the
quickstart (including the claim-your-instance warning), the environment-variable
reference, and the optional CI pipeline. The audience is a forker with a fresh
Cloudflare account — not an app user and not a contributor to this repo.

`README.md` in this directory covers the page layout, the commands, and the
rule that these pages track `docs/fork-deploy.md` — read it first. On top of
that:

- **Run everything through `vp`, never `astro` or `npm` directly.** The repo's
  toolchain is Vite+ (see the root `CLAUDE.md`), and this package is an
  importer of the root lockfile, not its own workspace.
- **Make the `docs/fork-deploy.md` edit and the page edit one commit**, so the
  two never publish out of step.
- **`SIGNUPS_ENABLED` stays gone** — the switch was dropped (ADR 0004), and
  the env reference documents its absence on purpose; don't "fix" that.
