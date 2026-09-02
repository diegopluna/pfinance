# pfinance

A self-hostable, Cloudflare-native personal finance app for individuals and
households: manual and CSV-imported transactions, with charts for net worth
and spending by category.

## Host your own

Fork this repository and deploy it to your own Cloudflare account — no source
edits needed. The [fork-and-host quickstart](docs/quickstart.md) walks
through it, from a fresh Cloudflare account to a running instance.

> **Claim your instance as soon as it deploys.** Self-serve sign-up is locked
> except while an instance has zero Users, so a fresh deploy belongs to
> whoever signs up first (`docs/adr/0004-signup-gating.md`).

The rest of the hosting docs cover [every deployer-facing environment
variable](docs/environment-variables.md) and the
[optional CI pipeline](docs/ci-pipeline.md).

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run -r test
```

- Build the monorepo:

```bash
vp run -r build
```

- Run the development server:

```bash
vp run dev
```
