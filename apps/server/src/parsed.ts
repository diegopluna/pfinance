// The result shape every request-body parser returns (accounts.ts,
// transactions.ts, categories.ts): the typed value, or the message the
// route's validator turns into a 400.
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }
