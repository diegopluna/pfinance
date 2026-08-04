import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Effect from 'effect/Effect'

const db = Cloudflare.D1.Database('DB')

export const server = Cloudflare.Worker('Server', {
  main: './apps/server/src/index.ts',
  compatibility: { flags: ['nodejs_compat'] },
  env: { DB: db },
})

export type ServerEnv = Cloudflare.InferEnv<typeof server>

export default Alchemy.Stack(
  'PFinance',
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const database = yield* db
    const api = yield* server
    const web = yield* Cloudflare.Website.Vite('Web', {
      assets: { notFoundHandling: 'single-page-application' },
      rootDir: './apps/web/',
      env: { VITE_API_URL: api.url.as<string>() },
    })

    return {
      webUrl: web.url,
      apiUrl: api.url,
      db: database.databaseName,
    }
  }),
)
