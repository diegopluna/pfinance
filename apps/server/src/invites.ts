import { invite, type Db } from '@pfinance/db'
import { eq } from 'drizzle-orm'

// Invites default to a week and never exceed it; the owner may shorten one
// (the minimum only exists so a bad value can't create an immortal link).
export const INVITE_MAX_TTL_SECONDS = 7 * 24 * 60 * 60
export const INVITE_DEFAULT_TTL_SECONDS = INVITE_MAX_TTL_SECONDS

// The link secret. 24 random bytes — same entropy class as a session token;
// hex keeps the copy-paste link free of URL-hostile characters.
export const generateInviteToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export type InviteRejection = 'not_found' | 'used' | 'revoked' | 'expired'

// Look up an Invite by token and classify it: 'pending' means redeemable,
// anything else is the reason it isn't. Shared by the public invite-info
// endpoint and the sign-up hook so the screen and the enforcement point can
// never disagree (same shape as signup-gate.ts).
export const findInvite = async (db: Db, token: string, now: Date) => {
  const [row] = await db.select().from(invite).where(eq(invite.token, token)).limit(1)
  if (!row) return { status: 'not_found' as const }
  if (row.usedAt !== null) return { status: 'used' as const, invite: row }
  if (row.revokedAt !== null) return { status: 'revoked' as const, invite: row }
  if (row.expiresAt.getTime() <= now.getTime()) return { status: 'expired' as const, invite: row }
  return { status: 'pending' as const, invite: row }
}

export const inviteRejectionMessage: Record<InviteRejection, string> = {
  not_found: 'This invite link is not valid.',
  used: 'This invite has already been used.',
  revoked: 'This invite was revoked.',
  expired: 'This invite has expired.',
}
