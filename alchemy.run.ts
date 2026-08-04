import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
// Deep imports: the alchemy/Drizzle barrel re-exports Postgres support,
// which requires the optional @effect/sql-pg peer we don't install.
import { providers as drizzleProviders } from 'alchemy/Drizzle/Providers'
import * as Drizzle from 'alchemy/Drizzle/Schema'
import * as GitHub from 'alchemy/GitHub'
import * as Output from 'alchemy/Output'
import * as Layer from 'effect/Layer'
import * as Effect from 'effect/Effect'
import * as Redacted from 'effect/Redacted'

// Drizzle schema (packages/db) is the source of truth; alchemy regenerates
// pending migration SQL on deploy whenever the schema drifts.
export const schema = Drizzle.Schema('Schema', {
  schema: './packages/db/src/schema.ts',
  out: './packages/db/migrations',
  dialect: 'sqlite',
})

export const database = Cloudflare.D1.Database(
  'DB',
  // Depending on schema.out (not a literal path) makes migration
  // generation run before the database applies pending files.
  Effect.map(schema, (s) => ({
    migrationsDir: s.out,
  })),
)

export const server = Cloudflare.Worker('Server', {
  main: './apps/server/src/index.ts',
  compatibility: { flags: ['nodejs_compat'] },
  env: {
    DB: database,
    // Signs Better Auth session cookies. The fallback keeps dev/test
    // zero-config; real deployments must set BETTER_AUTH_SECRET (rotating it
    // signs everyone out).
    BETTER_AUTH_SECRET: Redacted.make(
      process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-set-BETTER_AUTH_SECRET',
    ),
  },
  dev: {
    port: 3001,
  },
})

export type ServerEnv = Cloudflare.InferEnv<typeof server>

export default Alchemy.Stack(
  'PFinance',
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers(), drizzleProviders()),
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
