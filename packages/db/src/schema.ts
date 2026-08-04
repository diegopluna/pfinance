import { sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Ledger convention: every money amount column in this schema is an INTEGER
// in minor units (docs/adr/0006-money-integer-minor-units.md).

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})
