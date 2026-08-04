import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
import * as GitHub from 'alchemy/GitHub'
import * as Output from 'alchemy/Output'
import * as Layer from 'effect/Layer'
import * as Effect from 'effect/Effect'

const db = Cloudflare.D1.Database('DB', {
  migrationsDir: './migrations',
})

export const server = Cloudflare.Worker('Server', {
  main: './apps/server/src/index.ts',
  compatibility: { flags: ['nodejs_compat'] },
  env: { DB: db },
  dev: {
    port: 3001,
  },
})

export type ServerEnv = Cloudflare.InferEnv<typeof server>

export default Alchemy.Stack(
  'PFinance',
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const api = yield* server
    const web = yield* Cloudflare.Website.Vite('Web', {
      assets: { notFoundHandling: 'single-page-application' },
      rootDir: './apps/web/',
      env: { VITE_API_URL: api.url.as<string>() },
      dev: {
        port: 3000,
      },
    })
    const docs = yield* Cloudflare.Website.StaticSite('Docs', {
      cwd: './apps/docs',
      command: 'vp run build',
      outdir: 'dist',
      compatibility: {
        flags: ['nodejs_compat'],
      },
      dev: {
        cwd: './apps/docs',
        command: 'vp run dev',
      },
    })

    if (process.env.PULL_REQUEST) {
      yield* GitHub.Comment('preview-comment', {
        owner: 'diegopluna',
        repository: 'pfinance',
        issueNumber: Number(process.env.PULL_REQUEST),
        body: Output.interpolate`
          ## Preview Deployed
          
          **Web Deployment URL:** ${web.url}
          **Server Deployment URL:** ${api.url}
          **Docs Deployment URL:** ${docs.url}
        `,
      })
    }

    return {
      webUrl: web.url,
      apiUrl: api.url,
      docsUrl: docs.url,
    }
  }),
)
