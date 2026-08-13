// Connection probe & state classification for the mobile connect screen
// (ADR 0007). All of it lives here — portable functions over fetch + URL —
// because the app renders these states but owns none of the logic.

// The wire contract of GET /api/meta. `product` distinguishes a real
// pfinance Server from any other site that answers 200 with JSON;
// `apiVersion` is the integer the client ranges over; `serverVersion` is
// informational only, never parsed.
export interface ApiMeta {
  product: 'pfinance'
  apiVersion: number
  serverVersion: string
}

// The apiVersion range a client build supports (inclusive on both ends).
// The app ships knowing its own range; the Server only states what it is.
export interface SupportedApiVersions {
  minApiVersion: number
  maxApiVersion: number
}

// Exactly one of five states (issue #73). `apiUrl` is the normalized base
// the classification came from — after a well-known fallback it differs
// from what the user typed, and it is what the app persists on connect.
export type ConnectionState =
  | { state: 'unreachable' }
  | { state: 'not-a-server' }
  | { state: 'server-too-old'; apiUrl: string; meta?: ApiMeta }
  | { state: 'app-too-old'; apiUrl: string; meta: ApiMeta }
  | { state: 'connected'; apiUrl: string; meta: ApiMeta }

// A user-typed URL, canonicalized for probing: default scheme https, no
// query/hash, no trailing slash. Returns null when the input can't name an
// http(s) origin at all.
export const normalizeServerUrl = (input: string): string | null => {
  const trimmed = input.trim()
  if (trimmed === '') return null
  // Only prepend the default scheme when none is present — a bare host is
  // the common thing to type on a phone.
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  url.search = ''
  url.hash = ''
  url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString().replace(/\/+$/, '')
}

const isApiMeta = (body: unknown): body is ApiMeta => {
  const meta = body as { product?: unknown; apiVersion?: unknown; serverVersion?: unknown } | null
  return (
    meta !== null &&
    typeof meta === 'object' &&
    meta.product === 'pfinance' &&
    typeof meta.apiVersion === 'number' &&
    Number.isInteger(meta.apiVersion) &&
    typeof meta.serverVersion === 'string'
  )
}

// One probe of `${base}/api/meta`, reduced to the four outcomes the
// classifier distinguishes. 'missing' is specifically a 404: per ADR 0007
// the endpoint's absence is itself the "Server too old" signal, while any
// other non-contract answer means the URL isn't a pfinance API at all.
type MetaProbe =
  | { kind: 'network-error' }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'valid'; meta: ApiMeta }

const fetchMeta = async (base: string, fetchImpl: typeof fetch): Promise<MetaProbe> => {
  let response: Response
  try {
    response = await fetchImpl(`${base}/api/meta`, { headers: { accept: 'application/json' } })
  } catch {
    return { kind: 'network-error' }
  }
  if (response.status === 404) return { kind: 'missing' }
  if (!response.ok) return { kind: 'invalid' }
  const body: unknown = await response.json().catch(() => null)
  return isApiMeta(body) ? { kind: 'valid', meta: body } : { kind: 'invalid' }
}

// Pure classification of one probe outcome — version-range boundaries live
// here and nowhere else.
const classify = (
  probe: MetaProbe,
  supported: SupportedApiVersions,
  apiUrl: string,
): ConnectionState => {
  switch (probe.kind) {
    case 'network-error':
      return { state: 'unreachable' }
    case 'missing':
      return { state: 'server-too-old', apiUrl }
    case 'invalid':
      return { state: 'not-a-server' }
    case 'valid': {
      const { apiVersion } = probe.meta
      if (apiVersion < supported.minApiVersion)
        return { state: 'server-too-old', apiUrl, meta: probe.meta }
      if (apiVersion > supported.maxApiVersion)
        return { state: 'app-too-old', apiUrl, meta: probe.meta }
      return { state: 'connected', apiUrl, meta: probe.meta }
    }
  }
}

// The web build's pairing file (issue #70): the web app knows its API URL at
// deploy time and publishes it here, so typing the web address connects too.
// Origin-rooted per RFC 8615. The payload is `{ apiUrl: string }`.
export const WELL_KNOWN_PATH = '/.well-known/pfinance.json'

// Resolve the origin's pairing file to a normalized API base, or null when
// there is none — a plain SPA host answers this path with HTML, which fails
// JSON parsing and lands here too.
const fetchWellKnownApiUrl = async (
  base: string,
  fetchImpl: typeof fetch,
): Promise<string | null> => {
  try {
    const response = await fetchImpl(new URL(WELL_KNOWN_PATH, base).toString(), {
      headers: { accept: 'application/json' },
    })
    if (!response.ok) return null
    const body = (await response.json().catch(() => null)) as { apiUrl?: unknown } | null
    return typeof body?.apiUrl === 'string' ? normalizeServerUrl(body.apiUrl) : null
  } catch {
    return null
  }
}

// Probe a user-typed URL and classify the result. `fetchImpl` exists so an
// app can wrap timeouts or logging around the requests; it defaults to the
// platform fetch.
export const probeConnection = async (
  input: string,
  supported: SupportedApiVersions,
  fetchImpl: typeof fetch = fetch,
): Promise<ConnectionState> => {
  // A string that can't name an http(s) origin can't be reached.
  const base = normalizeServerUrl(input)
  if (base === null) return { state: 'unreachable' }

  const probe = await fetchMeta(base, fetchImpl)
  if (probe.kind === 'valid' || probe.kind === 'network-error') {
    return classify(probe, supported, base)
  }

  // No contract at the typed base — it may be the web app's origin (an SPA
  // host answers /api/meta with 200 HTML; a plain static host with 404), so
  // look for the pairing file and probe where it points. Without one, the
  // typed base's own answer stands: a 404 means a Server from before ADR
  // 0007, anything else isn't a pfinance Server.
  const target = await fetchWellKnownApiUrl(base, fetchImpl)
  if (target === null) return classify(probe, supported, base)
  return classify(await fetchMeta(target, fetchImpl), supported, target)
}
