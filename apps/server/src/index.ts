import { createDb, meta } from '@pfinance/db'
import { Hono } from 'hono'
import type { ServerEnv } from '../../../alchemy.run.ts'

const app = new Hono<{ Bindings: ServerEnv }>()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/health', async (c) => {
  const db = createDb(c.env.DB)
  // Querying a migrated table proves the schema was applied to the bound
  // database — the query throws (→ 500) if the migration never ran.
  await db.select({ key: meta.key }).from(meta).limit(1)
  return c.json({ ok: true })
})

export default app
