import { user, type Db } from '@pfinance/db'
import type { ServerEnv } from './env.ts'

// Self-serve sign-up policy (docs/adr/0004-signup-gating.md): the deployer's
// SIGNUPS_ENABLED switch, defaulting to locked, with the bootstrap exception —
// an instance with zero Users always accepts its first sign-up so the deployer
// can claim it. Shared by the enforcing auth hook and the public status
// endpoint so the web screen can never disagree with the server.
export const selfServeSignUpAllowed = async (db: Db, env: ServerEnv) => {
  if (env.SIGNUPS_ENABLED === 'true') {
    return true
  }
  const [existing] = await db.select({ id: user.id }).from(user).limit(1)
  return existing === undefined
}
