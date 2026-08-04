# D1 migrations and HTTP integration tests

The two patterns every backend ticket copies. Established in issue #2; `migrations/0001_init.sql` and `test/integ.test.ts` are the reference implementations.

## Schema migrations

Migrations are plain `.sql` files in `migrations/` at the repo root, applied in numeric-prefix order (`0001_init.sql`, `0002_add_accounts.sql`, …). They are wired to the D1 database in `alchemy.run.ts`:

```ts
const db = Cloudflare.D1.Database('DB', {
  migrationsDir: './migrations',
})
```

Alchemy applies pending migrations automatically, everywhere the stack runs:

- **Local dev** (`vp run dev`): applied to the local workerd D1 simulator.
- **Deploy** (CI previews, prod, and the test stage deployed by the test suite): applied to the live database as part of the D1 resource update.

Tracking uses the wrangler-compatible `d1_migrations` table; already-applied files are skipped, so applying is idempotent.

**To change the schema:** add a new file with the next numeric prefix. Never edit a migration that may already be applied somewhere — ship a follow-up migration instead. D1-over-HTTP has no transactions; keep each migration small and self-contained.

**Ledger convention:** every money amount column is an `INTEGER` in minor units (cents). See `docs/adr/0006-money-integer-minor-units.md`.

## Integration tests over HTTP

Tests live in `test/*.test.ts` at the repo root and run with `vp test`. They follow the [Alchemy testing tutorial](https://alchemy.run/tutorial/part-3): deploy the real stack once per file, then assert against the live worker over HTTP — the same seam every client uses, with the worker's real D1 binding behind it. Skeleton (see `test/integ.test.ts` for the full version):

```ts
const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
  providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
  state: Cloudflare.state(),
  stage: process.env.TEST_STAGE ?? 'test',
})

const stack = beforeAll(deploy(Stack), { timeout: 600_000 })
afterAll.skipIf(!process.env.CI)(destroy(Stack), { timeout: 600_000 })

test(
  'describes the behavior',
  Effect.gen(function* () {
    const { apiUrl } = yield* stack
    const response = yield* Test.getWhenReady(`${apiUrl}/health`)
    expect(response.status).toBe(200)
  }),
)
```

Rules of the pattern:

- `Test.make` uses the **same providers and state** as the main Stack in `alchemy.run.ts`.
- Deploy once in `beforeAll`; every test in the file shares that deployment.
- Use `Test.getWhenReady` (or `Test.executeWhenReady`) for the first request to a freshly deployed worker — it retries through the workers.dev cold-start window.
- **Destroy only in CI** (`afterAll.skipIf(!process.env.CI)`). Locally the `test` stage is kept between runs, so re-runs are fast no-op deploys (~20s instead of ~90s).
- CI sets `TEST_STAGE` to a per-PR stage (`test-pr-N`, see `.github/workflows/test.yml`) so concurrent PRs never share resources; `deploy.yml`'s cleanup job destroys it as a safety net on PR close.
- Test files run sequentially (`fileParallelism: false` in `vite.config.ts`) because each file deploys/destroys the shared stage. Prefer adding tests to an existing file over adding files — each new file costs a deploy cycle in CI.

**Adding a feature ticket's tests:** add the endpoint to `apps/server`, add a migration if the schema changes, then add HTTP tests to `test/integ.test.ts` (or a new file when the suite grows a distinct area). A test that writes through one endpoint and reads through another proves the worker + D1 + migration path end to end.
