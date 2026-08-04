import { Hono } from 'hono'
import type { ServerEnv } from '../../../alchemy.run.ts'

const app = new Hono<{ Bindings: ServerEnv }>()

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/health', async (c) => {
  const result = await c.env.DB.prepare('select 1 as ok').first<{ ok: number }>()
  return c.json({ ok: result?.ok === 1 })
})

export default app
