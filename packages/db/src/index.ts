import type { D1Database } from '@cloudflare/workers-types'
import { drizzle } from 'drizzle-orm/d1'
import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core'

export * from './account-types.ts'
export * from './date-formats.ts'
export * from './schema.ts'
export * from './transaction-kinds.ts'

// Module-form type import (not the global) so consumers that only need our
// types — e.g. the web app importing the server's RPC schema — don't need
// workers-types globals, which clash with lib.dom.
export const createDb = (d1: D1Database) => drizzle(d1)

// The async-SQLite base both drizzle drivers extend, plus the batch API they
// share: production satisfies this with the D1 adapter above, the server's
// unit tests with an in-memory libsql handle (db-harness.ts) — two adapters
// at one seam. The run-result generic is unknown; no consumer reads
// driver-level results.
export type Db = SQLiteAsyncDatabase<'async', unknown> & Pick<ReturnType<typeof createDb>, 'batch'>
