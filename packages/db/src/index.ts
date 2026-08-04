import { drizzle } from 'drizzle-orm/d1'

export * from './schema.ts'

export const createDb = (d1: D1Database) => drizzle(d1)

export type Db = ReturnType<typeof createDb>
