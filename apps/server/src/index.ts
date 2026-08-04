import { Hono } from 'hono'
import type { ServerEnv } from '../../../alchemy.run.ts'

const app = new Hono<{ Bindings: ServerEnv }>()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/health', async (c) => {
  const result = await c.env.DB.prepare('select 1 as ok').first<{ ok: number }>()
  const units = await c.env.DB.prepare(
    "select value from meta where key = 'ledger_amount_units'",
  ).first<{ value: string }>()
  return c.json({
    ok: result?.ok === 1,
    ledgerAmountUnits: units?.value ?? null,
  })
})

export default app
