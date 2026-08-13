import type { ClientResponse } from 'hono/client'
import { expect, test } from 'vite-plus/test'
import { ApiError, call, isForbidden } from '../src/index.ts'

// --- The shared client error seam (@pfinance/api-client) ---
// call() is the one place the ok-check, the server's uniform { error } body,
// and the throw convention live. No HTTP, no DOM — stubbed responses.

const respond = <T>(status: number, body: unknown) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as ClientResponse<T, 200, 'json'>)

const respondNonJson = (status: number) =>
  Promise.resolve({
    ok: false,
    status,
    json: () => Promise.reject(new Error('not json')),
  } as unknown as ClientResponse<never, 200, 'json'>)

test('call returns the success body', async () => {
  await expect(call(respond<{ ok: boolean }>(200, { ok: true }))).resolves.toEqual({ ok: true })
})

test('call throws ApiError carrying the server error message and status', async () => {
  const failure = call(respond(404, { error: 'Import not found.' }), 'Failed to load the import')
  await expect(failure).rejects.toThrow('Import not found.')
  await expect(failure).rejects.toMatchObject({ name: 'ApiError', status: 404 })
})

test('call falls back to the caller message when the body has no error field', async () => {
  await expect(call(respond(500, { unexpected: true }), 'Failed to save')).rejects.toThrow(
    'Failed to save',
  )
})

test('call survives a non-JSON error body (worker crash, proxy HTML)', async () => {
  const failure = call(respondNonJson(502), 'Failed to load accounts')
  await expect(failure).rejects.toThrow('Failed to load accounts')
  await expect(failure).rejects.toMatchObject({ status: 502 })
})

test('isForbidden reads exactly the 403 ApiError', () => {
  expect(isForbidden(new ApiError('Only the household owner…', 403))).toBe(true)
  expect(isForbidden(new ApiError('Not found', 404))).toBe(false)
  expect(isForbidden(new Error('forbidden'))).toBe(false)
  expect(isForbidden(undefined)).toBe(false)
})
