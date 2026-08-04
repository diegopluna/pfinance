// Deploy-time lifecycle of the database, owned by the package that owns the
// schema: generation of migration SQL, the D1 database that applies it, and
// the seed. Import this only from stack definitions — never from worker
// code, which uses the runtime entrypoint (./index.ts) instead.
//
// alchemy/effect resolve from the workspace root's dependencies: stacks are
// evaluated by the root runner, so the root owns the deploy-time toolchain.
// Deep alchemy/Drizzle imports avoid the barrel's optional @effect/sql-pg
// peer. All paths are relative to the runner's cwd — the workspace root.
import * as Cloudflare from 'alchemy/Cloudflare'
import * as Drizzle from 'alchemy/Drizzle/Schema'
import * as Effect from 'effect/Effect'

// Drizzle schema (./schema.ts) is the source of truth; alchemy regenerates
// pending migration SQL on deploy whenever the schema drifts.
export const schema = Drizzle.Schema('Schema', {
  schema: './packages/db/src/schema.ts',
  out: './packages/db/migrations',
  dialect: 'sqlite',
})

export const database = Cloudflare.D1.Database(
  'DB',
  // Depending on schema.out (not a literal path) makes migration
  // generation run before the database applies pending files. The seed
  // applies after migrations and re-runs only when the file changes.
  Effect.map(schema, (s) => ({
    migrationsDir: s.out,
    importFiles: ['./packages/db/seed.sql'],
  })),
)
