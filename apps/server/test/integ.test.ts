import * as Cloudflare from 'alchemy/Cloudflare'
import { providers as drizzleProviders } from 'alchemy/Drizzle/Providers'
import * as GitHub from 'alchemy/GitHub'
import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { expect } from 'vite-plus/test'
import Stack from '../../../alchemy.run.ts'

// Same providers/state as the main Stack (alchemy.run.ts). Stage defaults to
// "test" — shared and kept alive between local runs; CI sets TEST_STAGE to a
// per-PR stage so concurrent runs don't fight over the same resources.
const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
  providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers(), drizzleProviders()),
  state: Cloudflare.state(),
  stage: process.env.TEST_STAGE ?? 'test',
})

// Deploy once for the whole file. Locally the stack persists between runs, so
// re-runs are fast no-op deploys; only changed resources are updated.
const stack = beforeAll(deploy(Stack), { timeout: 600_000 })

// Tear down only in CI (GitHub Actions sets CI=true) so local iteration keeps
// the deployed test stack between runs.
afterAll.skipIf(!process.env.CI)(destroy(Stack), { timeout: 600_000 })

test(
  'health endpoint round-trips the worker and its D1 binding',
  Effect.gen(function* () {
    const { apiUrl } = yield* stack

    // getWhenReady retries through the workers.dev cold-start window.
    const response = yield* Test.getWhenReady(`${apiUrl}/health`)
    expect(response.status).toBe(200)

    // ledgerAmountUnits comes from the `meta` row written by
    // migrations/0001_init.sql, proving migrations were applied to the
    // worker's bound database.
    const body = yield* response.json
    expect(body).toEqual({ ok: true, ledgerAmountUnits: 'minor' })
  }),
  { timeout: 120_000 },
)
