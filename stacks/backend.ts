import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import { providers as drizzleProviders } from 'alchemy/Drizzle/Providers'
import * as Layer from 'effect/Layer'
import * as Effect from 'effect/Effect'
import { assertDomainsProdOnly, server } from '../alchemy.run.ts'

// Backend-only composition: Schema → D1 → Worker. The integration tests
// deploy this stack, so proving the API doesn't provision Web, Docs, or
// preview-comment concerns; the full product stack (alchemy.run.ts)
// composes the same resource declarations. Same stack name — a deployment
// is identified by (stack, stage), and the two compositions never share a
// stage: this one owns the test stages, alchemy.run.ts owns dev/previews/
// prod.
export default Alchemy.Stack(
  'PFinance',
  {
    providers: Layer.mergeAll(Cloudflare.providers(), drizzleProviders()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    yield* assertDomainsProdOnly
    const api = yield* server
    return { apiUrl: api.url }
  }),
)
