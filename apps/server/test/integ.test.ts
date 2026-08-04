import * as Cloudflare from 'alchemy/Cloudflare'
import { providers as drizzleProviders } from 'alchemy/Drizzle/Providers'
import * as GitHub from 'alchemy/GitHub'
import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { expect } from 'vite-plus/test'
import Stack from '../../../alchemy.run.ts'

// Same providers/state as the main Stack (alchemy.run.ts). Stage defaults to
// "test"; CI sets TEST_STAGE to a per-PR stage so concurrent runs don't
// fight over the same resources.
//
// Local runs emulate the whole stack in workerd (dev mode) — nothing is
// created on Cloudflare. CI runs against real cloud resources and destroys
// them afterwards. Set ALCHEMY_DEV=1/0 to override either way.
const { test, beforeAll, afterAll, deploy, destroy } = Test.make({
  providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers(), drizzleProviders()),
  state: Cloudflare.state(),
  stage: process.env.TEST_STAGE ?? 'test',
  dev: process.env.ALCHEMY_DEV !== undefined ? undefined : !process.env.CI,
})

// Deploy once for the whole file. Locally the emulated stack's state persists
// between runs, so re-runs are fast no-op deploys.
const stack = beforeAll(deploy(Stack), { timeout: 600_000 })

// Tear down only in CI (GitHub Actions sets CI=true); local dev-mode runs
// keep their state for fast iteration and hold no cloud resources anyway.
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
