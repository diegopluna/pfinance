import { user, type Db } from '@pfinance/db'

// Self-serve sign-up policy (docs/adr/0004-signup-gating.md): always locked,
// with the bootstrap exception — an instance with zero Users accepts its
// first sign-up so the deployer can claim it. After that, new members only
// ever arrive via invites (ADR 0004 §2, not built yet). Shared by the
// enforcing auth hook and the public status endpoint so the web screen can
// never disagree with the server.
export const selfServeSignUpAllowed = async (db: Db) => {
  const [existing] = await db.select({ id: user.id }).from(user).limit(1)
  return existing === undefined
}
