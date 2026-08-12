import * as Alchemy from 'alchemy'
import * as Cloudflare from 'alchemy/Cloudflare'
// Deep imports: the alchemy/Drizzle barrel re-exports Postgres support,
// which requires the optional @effect/sql-pg peer we don't install.
import { providers as drizzleProviders } from 'alchemy/Drizzle/Providers'
import * as Drizzle from 'alchemy/Drizzle/Schema'
import * as GitHub from 'alchemy/GitHub'
import * as Output from 'alchemy/Output'
import * as Config from 'effect/Config'
import * as Layer from 'effect/Layer'
import * as Effect from 'effect/Effect'
import type { ServerEnv } from './apps/server/src/env.ts'
import { detectRepository } from './stacks/repository.ts'

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

// Optional production URLs (docs/fork-deploy.md): each var attaches its
// hostname to the matching worker as a Cloudflare custom domain — DNS record
// and edge certificate are managed by Alchemy, with the zone inferred from
// the hostname (it must already exist in the account). The worker's primary
// url output becomes https://<domain>, so VITE_API_URL and the printed
// deploy URLs follow along. Unset (CI previews, tests, forks without a
// domain) the prop resolves to undefined, which leaves custom domains
// unmanaged and the workers on their *.workers.dev URLs.
//
// Production-only, enforced: a hostname can be attached to only one worker
// account-wide, so any other stage deploying with one of these vars set
// (say, exported in the deploying shell) would detach the domain from the
// production instance. Every stack composing these workers yields this guard
// before its first resource, turning that into a loud failure — before
// anything is created — instead of a silent takeover. The production stage
// is 'prod' (the quickstart's manual deploy) unless PROD_STAGE designates
// another; the CI workflow sets it to the branch name on push deploys, so a
// CI-hosted production (this repo: stage 'master') can carry the domains
// while pr-N previews and test stages never can.
//
// The guard is a standalone step (not folded into the domain props) because
// the worker provider reads `domain` structurally — an Effect-valued prop is
// not resolved, it is mistaken for a WorkerDomainConfig.
const domainVars = ['WEB_DOMAIN', 'API_DOMAIN', 'DOCS_DOMAIN'] as const
const prodStage = process.env.PROD_STAGE || 'prod'
export const assertDomainsProdOnly = Effect.gen(function* () {
  const stage = yield* Alchemy.Stage
  if (stage === prodStage) return
  for (const envVar of domainVars) {
    if (process.env[envVar]) {
      return yield* Effect.die(
        new Error(
          `${envVar}=${process.env[envVar]} is set, but custom domains attach only on ` +
            `the production stage '${prodStage}' — this deploy targets stage '${stage}', ` +
            `which would steal the domain from the production instance. Unset ${envVar} ` +
            `for non-production deploys, or set PROD_STAGE if your production stage has ` +
            `another name.`,
        ),
      )
    }
  }
})
const [webDomain, apiDomain, docsDomain] = domainVars.map(
  (envVar) => process.env[envVar] || undefined,
)

export const server = Cloudflare.Worker('Server', {
  main: './apps/server/src/index.ts',
  compatibility: { flags: ['nodejs_compat'] },
  env: {
    DB: database,
    // Signs Better Auth session cookies. Minted once per stage and persisted
    // in alchemy state, so it survives deploys with no env var to manage and
    // no fallback secret in the repo. Replacing the resource rotates it
    // (signing everyone out).
    BETTER_AUTH_SECRET: Alchemy.makeRandom('BetterAuthSecret'),
    // Pins the browser origin trusted for credentialed requests (see
    // apps/server/src/origins.ts). Unset ('') falls back to trusting
    // workers.dev broadly — fine for dev/previews, set it in production.
    // A WEB_DOMAIN deploy is origin-pinned without a second knob: the
    // default becomes that domain's origin, and explicit WEB_ORIGIN wins.
    WEB_ORIGIN: Config.string('WEB_ORIGIN').pipe(
      Config.withDefault(webDomain ? `https://${webDomain}` : ''),
    ),
  },
  domain: apiDomain,
  dev: {
    port: 3001,
  },
})

// The worker declares its own env type (apps/server/src/env.ts) so its code
// never imports this infra file; these assertions fail to compile if the
// declared type drifts from the env deployed above, in either direction.
type InferredEnv = Cloudflare.InferEnv<typeof server>
type _AssertEnvDeclared = [
  InferredEnv extends ServerEnv ? true : never,
  ServerEnv extends InferredEnv ? true : never,
][number]
const _envMatches: _AssertEnvDeclared = true

export default Alchemy.Stack(
  'PFinance',
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers(), drizzleProviders()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    yield* assertDomainsProdOnly
    const api = yield* server
    const web = yield* Cloudflare.Website.Vite('Web', {
      assets: { notFoundHandling: 'single-page-application' },
      rootDir: './apps/web/',
      env: { VITE_API_URL: api.url.as<string>() },
      domain: webDomain,
      dev: {
        port: 3000,
      },
    })
    const docs = yield* Cloudflare.Website.StaticSite('Docs', {
      cwd: './apps/docs',
      command: 'vp run build',
      outdir: 'dist',
      domain: docsDomain,
      compatibility: {
        flags: ['nodejs_compat'],
      },
      dev: {
        cwd: './apps/docs',
        command: 'vp run dev',
      },
    })

    // PR preview comments are optional: they need PULL_REQUEST (set by the
    // deploy workflow) plus a detectable repository (GITHUB_REPOSITORY or
    // the clone's origin remote — see stacks/repository.ts and
    // docs/fork-deploy.md). A fork that only hosts the app never enters
    // this branch and needs no GitHub credentials.
    if (process.env.PULL_REQUEST) {
      const repo = detectRepository()
      if (repo === undefined) {
        yield* Effect.logWarning(
          'PULL_REQUEST is set but no GitHub repository was detected ' +
            '(set GITHUB_REPOSITORY=owner/repo); skipping the PR preview comment.',
        )
      } else {
        yield* GitHub.Comment('preview-comment', {
          owner: repo.owner,
          repository: repo.repository,
          issueNumber: Number(process.env.PULL_REQUEST),
          // interpolate joins the template raw (no dedent), so the body is
          // left-aligned to keep the comment valid markdown.
          body: Output.interpolate`## Preview Deployed

**Web Deployment URL:** ${web.url}
**Server Deployment URL:** ${api.url}
**Docs Deployment URL:** ${docs.url}
`,
        })
      }
    }

    return {
      webUrl: web.url,
      apiUrl: api.url,
      docsUrl: docs.url,
    }
  }),
)
