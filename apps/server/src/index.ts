import { createDb, meta } from '@pfinance/db'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { ServerEnv } from '../../../alchemy.run.ts'

const app = new Hono<{ Bindings: ServerEnv }>()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/health', async (c) => {
  const db = createDb(c.env.DB)
  const units = await db
    .select({ value: meta.value })
    .from(meta)
    .where(eq(meta.key, 'ledger_amount_units'))
    .get()
  return c.json({
    ok: units?.value === 'minor',
    ledgerAmountUnits: units?.value ?? null,
  })
})

export default app
