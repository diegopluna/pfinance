import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Ledger convention: every money amount column in this schema is an INTEGER
// in minor units (docs/adr/0006-money-integer-minor-units.md).

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

// --- Auth (Better Auth core tables; docs/adr/0005) ---

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// Named auth_account (not account) — "account" is reserved for the financial
// Account concept (CONTEXT.md); Better Auth maps to it via the adapter schema.
export const authAccount = sqliteTable('auth_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// --- Tenancy ---

export const household = sqliteTable('household', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  // ISO 4217 code, chosen once at creation and immutable in the MVP (ADR
  // 0002); validated against @pfinance/currency at sign-up. The default
  // exists only so the column can be added to pre-currency rows — the app
  // always writes it explicitly.
  currency: text('currency').notNull().default('USD'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// An Invite is a single-use, expiring link issued by a Household's owner
// (CONTEXT.md; ADR 0004 §2). Lifecycle is recorded, never deleted: usedAt
// marks consumption, revokedAt marks revocation, and "pending" is the derived
// state of neither with expiresAt in the future.
export const invite = sqliteTable('invite', {
  id: text('id').primaryKey(),
  // The secret carried in the copy-paste link (ADR 0005: no email anywhere).
  token: text('token').notNull().unique(),
  householdId: text('household_id')
    .notNull()
    .references(() => household.id, { onDelete: 'cascade' }),
  // The issuing owner, kept for the audit trail; set null if that User goes
  // away so the Invite record survives.
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp' }),
  usedBy: text('used_by').references(() => user.id, { onDelete: 'set null' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
})

export const member = sqliteTable('member', {
  id: text('id').primaryKey(),
  // Unique: a User belongs to exactly one Household in the MVP.
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  householdId: text('household_id')
    .notNull()
    .references(() => household.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['owner', 'member'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})
