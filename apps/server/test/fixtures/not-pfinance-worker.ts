// A deployable stand-in for "some other product's API": answers 200 JSON on
// every path — including /api/meta — but never the pfinance contract. The
// connection tests probe it to prove such a URL classifies as
// "not a pfinance Server" rather than connecting or reading as too old.
export default {
  fetch: () =>
    new Response(JSON.stringify({ hello: 'world' }), {
      headers: { 'content-type': 'application/json' },
    }),
}
