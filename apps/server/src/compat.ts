// The compatibility contract served by GET /api/meta (ADR 0007): a
// store-distributed client classifies a Server's age from apiVersion alone,
// so this object is the contract's single home — handler and clients both
// hang off it.
//
// Bump apiVersion ONLY on a breaking API change — removing or renaming a
// route or field, changing a type's meaning, tightening auth on an existing
// route. Additive changes (new routes, new optional fields) never bump it.
//
// serverVersion is informational only — surfaced for diagnostics and
// support, never parsed by clients. It mirrors the workspace version by
// hand; pfinance is fork-and-deploy, so there is no release train to track.
export const apiMeta = {
  product: 'pfinance',
  apiVersion: 1,
  serverVersion: '0.0.0',
} as const
