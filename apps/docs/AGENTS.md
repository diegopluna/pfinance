# pfinance docs site

Deployer-facing documentation for people who fork and self-host pfinance: the
quickstart (including the claim-your-instance warning), the environment-variable
reference, and the optional CI pipeline. The audience is a forker with a fresh
Cloudflare account — not an app user and not a contributor to this repo.

`README.md` in this directory describes the page layout and commands. Two
things it can't tell you:

- **Run everything through `vp`, never `astro` or `npm` directly.** The repo's
  toolchain is Vite+ (see the root `CLAUDE.md`); `astro` is not on the PATH and
  this package is an importer of the root lockfile, not its own workspace.
- **These pages restate the deploy defaults recorded in `docs/fork-deploy.md`.**
  A change to a default, an env var, or the claim/bootstrap behavior is a
  two-place edit — update both, in the same commit. In particular,
  `SIGNUPS_ENABLED` was dropped (ADR 0004); the env reference documents its
  absence on purpose.
