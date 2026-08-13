import {
  normalizeServerUrl,
  probeConnection,
  type ConnectionState,
  type SupportedApiVersions,
} from '@pfinance/api-client'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Test from 'alchemy/Test/Vitest'
import * as Effect from 'effect/Effect'
import { expect } from 'vite-plus/test'
import Stack from '../../../stacks/backend.ts'
import { afterAll, beforeAll, deploy, destroy, freshServer, test } from './harness.ts'

// The connection probe & classifier of @pfinance/api-client (issue #73),
// asserted through the deployed-backend HTTP seam — the exact seam the mobile
// app's connect screen will use. No test here mints a User, so the whole file
// runs against the shared stack.
const stack = beforeAll(deploy(Stack), { timeout: 600_000 })

afterAll.skipIf(!process.env.CI)(destroy(Stack), { timeout: 600_000 })

// The probe classifies 404s (they mean "Server too old", ADR 0007), so it
// must never race the workers.dev edge-convergence window where a fresh
// worker still 404s (issue #68). Warming with getWhenReady first retries
// that window away; every test probes only after this succeeds.
const warm = (apiUrl: string) => Test.getWhenReady(`${apiUrl}/api/meta`)

// What every deployed test worker serves from GET /api/meta (ADR 0007) —
// apiVersion is 1 until the first breaking API change.
const liveMeta = { product: 'pfinance', apiVersion: 1, serverVersion: expect.any(String) }

// Warming converges the edge, but workers.dev can still serve a stray
// placeholder 404 afterwards (issue #68) — and the probe legitimately
// classifies 404s, so one stray answer flips the state. Same rule as the
// suite's executeWhenReady calls: retry past edge noise until the probe
// settles on the expected state, then let the caller assert the full shape.
// A genuinely wrong classification just retries out and fails the final
// assertion with the last state it saw.
const probeUntil = (
  expected: ConnectionState['state'],
  input: string,
  supported: SupportedApiVersions,
) =>
  Effect.gen(function* () {
    let state = yield* Effect.promise(() => probeConnection(input, supported))
    for (let attempt = 0; state.state !== expected && attempt < 20; attempt++) {
      yield* Effect.sleep('3 seconds')
      state = yield* Effect.promise(() => probeConnection(input, supported))
    }
    return state
  })

test(
  'probing the API URL with a range containing the live apiVersion connects',
  Effect.gen(function* () {
    const { apiUrl = '' } = yield* stack
    yield* warm(apiUrl)

    const state = yield* probeUntil('connected', apiUrl, { minApiVersion: 1, maxApiVersion: 1 })

    expect(state).toEqual({
      state: 'connected',
      apiUrl,
      meta: liveMeta,
    })
  }),
  { timeout: 120_000 },
)

test(
  'apiVersion range boundaries classify the live Server: below, inside (both ends), above',
  Effect.gen(function* () {
    const { apiUrl = '' } = yield* stack
    yield* warm(apiUrl)

    const probeWith = (
      expected: ConnectionState['state'],
      minApiVersion: number,
      maxApiVersion: number,
    ) => probeUntil(expected, apiUrl, { minApiVersion, maxApiVersion })

    // The live apiVersion (1) sits on either inclusive boundary → connected.
    expect((yield* probeWith('connected', 1, 2)).state).toBe('connected')
    expect((yield* probeWith('connected', 0, 1)).state).toBe('connected')

    // Below the supported range: the Server predates the app → update Server.
    const tooOld = yield* probeWith('server-too-old', 2, 3)
    expect(tooOld).toEqual({
      state: 'server-too-old',
      apiUrl,
      meta: liveMeta,
    })

    // Above the supported range: the app predates the Server → update app.
    const tooNew = yield* probeWith('app-too-old', 0, 0)
    expect(tooNew).toEqual({
      state: 'app-too-old',
      apiUrl,
      meta: liveMeta,
    })
  }),
  { timeout: 120_000 },
)

test(
  'a URL whose origin answers but has no meta endpoint is a Server too old',
  Effect.gen(function* () {
    const { apiUrl = '' } = yield* stack
    yield* warm(apiUrl)

    // A nested base makes the live worker 404 both `<base>/api/meta` and the
    // origin's well-known file — exactly what an old pfinance Server (or its
    // API host before ADR 0007) answers. The 404 is the "too old" signal.
    const state = yield* probeUntil('server-too-old', `${apiUrl}/nested`, {
      minApiVersion: 1,
      maxApiVersion: 1,
    })

    expect(state).toEqual({ state: 'server-too-old', apiUrl: `${apiUrl}/nested` })
  }),
  { timeout: 120_000 },
)

test(
  'a host that never answers is unreachable',
  Effect.gen(function* () {
    // .invalid never resolves (RFC 6761), so the fetch itself fails — the
    // network error, not any HTTP answer, is what classifies here.
    const state = yield* Effect.promise(() =>
      probeConnection('https://pfinance.invalid', { minApiVersion: 1, maxApiVersion: 1 }),
    )
    expect(state).toEqual({ state: 'unreachable' })

    // Input that can't even name an http(s) origin is unreachable by
    // construction — the probe never sends anything.
    const garbage = yield* Effect.promise(() =>
      probeConnection('not a url', { minApiVersion: 1, maxApiVersion: 1 }),
    )
    expect(garbage).toEqual({ state: 'unreachable' })
  }),
  { timeout: 120_000 },
)

test(
  'user-typed URL forms normalize to the same probed base',
  Effect.gen(function* () {
    const { apiUrl = '' } = yield* stack
    yield* warm(apiUrl)

    // Trailing slash — the form a paste or autocomplete produces — probes
    // the same Server and reports the canonical base.
    const state = yield* probeUntil('connected', `${apiUrl}/`, {
      minApiVersion: 1,
      maxApiVersion: 1,
    })
    expect(state.state).toBe('connected')
    expect(state.state === 'connected' && state.apiUrl).toBe(apiUrl)

    // The forms the seam can't exercise (the emulated stack is http, a bare
    // host implies https), asserted on the normalizer directly.
    expect(normalizeServerUrl('my-server.example.com')).toBe('https://my-server.example.com')
    expect(normalizeServerUrl('  https://my-server.example.com/app/?q=1#top  ')).toBe(
      'https://my-server.example.com/app',
    )
    expect(normalizeServerUrl('http://192.168.0.10:8787')).toBe('http://192.168.0.10:8787')
    expect(normalizeServerUrl('ftp://my-server.example.com')).toBeNull()
    expect(normalizeServerUrl('   ')).toBeNull()
  }),
  { timeout: 120_000 },
)

// --- Probes against non-pfinance origins (scratch stacks) ---
// These need a live URL that is NOT a pfinance Server, so each deploys a
// stub worker through the scratch provider — same seam, different origin.

const notPfinance = Cloudflare.Worker('NotPfinance', {
  main: './apps/server/test/fixtures/not-pfinance-worker.ts',
})

test.provider(
  'an origin answering 200 without the meta contract is not a pfinance Server',
  (scratch) =>
    Effect.gen(function* () {
      const { url = '' } = yield* scratch.deploy(
        Effect.map(notPfinance, (worker) => ({ url: worker.url })),
      )
      yield* Test.getWhenReady(url)

      const state = yield* probeUntil('not-a-server', url, { minApiVersion: 1, maxApiVersion: 1 })
      expect(state).toEqual({ state: 'not-a-server' })

      // A 5xx is a server failing, not a server missing: a real pfinance
      // Server mid-outage must read as unreachable ("try again"), never as
      // "not a pfinance Server" ("your URL is wrong") — issue #70's designed
      // states point at the right fix. /broken answers 500 on every path.
      const outage = yield* probeUntil('unreachable', `${url}/broken`, {
        minApiVersion: 1,
        maxApiVersion: 1,
      })
      expect(outage).toEqual({ state: 'unreachable' })
    }),
  { timeout: 600_000 },
)

// The web app's origin, stubbed: SPA HTML everywhere plus the well-known
// pairing file pointing at a real pfinance worker in the same scratch stack.
const webOrigin = Cloudflare.Worker('WebOriginStub', {
  main: './apps/server/test/fixtures/web-origin-stub.ts',
  env: {
    API_URL: Effect.map(freshServer, (worker) => worker.url ?? ''),
  },
})

test.provider(
  'typing the web URL follows the well-known file to the API URL and connects',
  (scratch) =>
    Effect.gen(function* () {
      const { webUrl = '', apiUrl = '' } = yield* scratch.deploy(
        Effect.map(Effect.all([webOrigin, freshServer]), ([web, api]) => ({
          webUrl: web.url,
          apiUrl: api.url,
        })),
      )
      // Warm both origins past the edge window — and pin the stub's pairing
      // payload to the deployed API URL, so a broken env threading fails
      // here as a crisp mismatch instead of a probe retrying into timeout.
      const pairing = yield* Test.getWhenReady(`${webUrl}/.well-known/pfinance.json`)
      expect(yield* pairing.json).toEqual({ apiUrl })
      yield* Test.getWhenReady(`${apiUrl}/api/meta`)

      // Story 4 (issue #70): the Member typed the only address they know —
      // the web app's. Its origin answers /api/meta with SPA HTML, so the
      // probe must fall back to the well-known file and connect where it
      // points, reporting THAT base as the one to persist.
      const state = yield* probeUntil('connected', webUrl, {
        minApiVersion: 1,
        maxApiVersion: 1,
      })

      expect(state).toEqual({
        state: 'connected',
        apiUrl,
        meta: liveMeta,
      })
    }),
  { timeout: 600_000 },
)
