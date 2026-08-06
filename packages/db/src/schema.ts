import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { ACCOUNT_TYPE_VALUES } from './account-types.ts'
import { TRANSACTION_KIND_VALUES } from './transaction-kinds.ts'

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

// --- Ledger ---

// A financial Account belonging to a Household (CONTEXT.md; issue #7). Its
// Balance is never stored: it is derived as openingBalance + the sum of its
// Transactions (ADR 0001). The type marks assets vs liabilities so Net Worth
// can sign them (account-types.ts). Archiving hides an Account that closed
// in real life while keeping its history — rows are never deleted.
export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  householdId: text('household_id')
    .notNull()
    .references(() => household.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', { enum: ACCOUNT_TYPE_VALUES }).notNull(),
  // Integer minor units (ADR 0006).
  openingBalance: integer('opening_balance').notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// A Transaction is the atom of the ledger (CONTEXT.md; issue #8): a signed
// movement of money on exactly one Account. Its Household is the Account's —
// no denormalized householdId, so a Transaction can never disagree with its
// Account about tenancy. The date is a calendar date stored as an ISO
// `YYYY-MM-DD` TEXT column, never a timestamp: no timezone can shift it, and
// lexicographic order is chronological order for range filters.
export const transaction = sqliteTable('transaction', {
  id: text('id').primaryKey(),
  accountId: text('account_id')
    .notNull()
    .references(() => account.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  // Signed integer minor units (ADR 0006): negative = money out.
  amount: integer('amount').notNull(),
  description: text('description').notNull(),
  // The Transaction flavor (transaction-kinds.ts): balance_adjustment rows
  // move the Balance but are excluded from the Expense/Income derived views
  // (issue #9). The default exists only so the column can be added to
  // pre-kind rows — the app always writes it explicitly.
  kind: text('kind', { enum: TRANSACTION_KIND_VALUES }).notNull().default('standard'),
  // Exactly one Category or NULL = Uncategorized (ADR 0003) — no join table,
  // no splits. Categories are archived rather than deleted, so set-null is a
  // safety net, not a code path. The FK alone cannot see tenancy (a
  // Category's Household is its own, a Transaction's is its Account's), so
  // the API checks the Category belongs to the caller's Household on write.
  categoryId: text('category_id').references(() => category.id, { onDelete: 'set null' }),
  // The Member who entered it, kept for attribution; set null if that User
  // is removed so the ledger row survives (a User holds no financial data).
  createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// A Category is a household-owned label for spending/income analysis
// (CONTEXT.md; ADR 0003): a flat list — no parent column, ever — seeded with
// defaults at Household creation (issue #10). Archiving retires a label from
// assignment while Transactions that carry it keep their history; rows are
// never deleted. Seeded rows use deterministic ids derived from the
// Household id (see apps/server categories module), so the one-time backfill
// of pre-seed Households can insert-or-ignore idempotently.
export const category = sqliteTable('category', {
  id: text('id').primaryKey(),
  householdId: text('household_id')
    .notNull()
    .references(() => household.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
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
