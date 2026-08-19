export * from './connection.ts'

import { hc } from 'hono/client'
import type { ClientRequestOptions, ClientResponse } from 'hono/client'
import type { SuccessStatusCode } from 'hono/utils/http-status'
import type { AppType } from '@pfinance/server'

// Typed RPC client over the server's chained route schema. The base URL is a
// runtime value — each app (web, mobile) binds its own origin and fetch
// options (cookies, headers) at instantiation.
export const createApiClient = (baseUrl: string, options?: ClientRequestOptions) =>
  hc<AppType>(baseUrl, options)

export type ApiClient = ReturnType<typeof createApiClient>

// The application seam over the typed RPC client: every request crosses
// call(), so the ok-check, the server's uniform { error } body, and the
// throw convention exist exactly once — every client decodes errors
// identically. Components keep rendering error.message unchanged;
// status-dependent UI reads ApiError.status.
export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// The request never reached the Server at all — offline, DNS, a dead
// address. Its message is the designed voice for every client's write
// failure (ADR 0007: writes require a connection and fail visibly), and
// its type is how read surfaces recognize "render the cache instead".
export class ConnectionError extends Error {
  constructor() {
    super('Needs a connection — the Server was unreachable.')
    this.name = 'ConnectionError'
  }
}

export const isConnectionFailure = (error: unknown): boolean => error instanceof ConnectionError

// The owner-only screens relay the server's 403 instead of half-rendering.
export const isForbidden = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 403

// The success body of a ClientResponse union, filtered by STATUS, not by
// `ok`: hono types a status-less c.json() with the wide ContentfulStatusCode
// union, which makes `ok` a plain boolean — but the inferred status
// parameter distributes, so success members keep their body and error-status
// members drop to never.
type SuccessBody<R> =
  R extends ClientResponse<infer T, infer S, 'json'>
    ? S extends SuccessStatusCode
      ? T
      : never
    : never

export const call = async <R extends ClientResponse<unknown>>(
  request: Promise<R>,
  fallback = 'Request failed',
): Promise<SuccessBody<R>> => {
  let response: R
  try {
    response = await request
  } catch {
    // fetch rejects (TypeError) only when no response exists — the network
    // layer's raw wording never reaches a screen.
    throw new ConnectionError()
  }
  if (!response.ok) {
    // 4xx bodies carry { error }; anything else (worker crash, HTML from a
    // proxy) falls back to the caller's message.
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(body?.error ?? fallback, response.status)
  }
  return (await response.json()) as SuccessBody<R>
}
