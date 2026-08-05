import type { D1Database } from '@cloudflare/workers-types'
import { drizzle } from 'drizzle-orm/d1'

export * from './schema.ts'

// Module-form type import (not the global) so consumers that only need our
// types — e.g. the web app importing the server's RPC schema — don't need
// workers-types globals, which clash with lib.dom.
export const createDb = (d1: D1Database) => drizzle(d1)

export type Db = ReturnType<typeof createDb>
