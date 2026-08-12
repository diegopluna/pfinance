// The result shape every request-body parser returns (accounts.ts,
// transactions.ts, categories.ts): the typed value, or the message the
// route's validator turns into a 400.
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

// What a Ledger verb (the write paths in transactions.ts, transfers.ts,
// imports.ts) returns: the view-shaped value, or the failure carrying the
// HTTP status the route maps mechanically. The status lives behind the seam
// because the 400-vs-404 knowledge belongs to the rule that rejected.
export type VerbResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: 400 | 404 | 409; error: string }
