import type { D1Database } from '@cloudflare/workers-types'

// The worker's bindings, declared here (module-scoped types only) so worker
// code and the web app's RPC type import never pull in the infra stack —
// alchemy.run.ts asserts this stays equal to the env it actually deploys.
export type ServerEnv = {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  WEB_ORIGIN: string
}
