// A deployable stand-in for "some other product's API": answers 200 JSON on
// every path — including /api/meta — but never the pfinance contract. The
// connection tests probe it to prove such a URL classifies as
// "not a pfinance Server" rather than connecting or reading as too old.
// Paths under /broken answer 500 instead, standing in for a real Server
// mid-outage (or a dying proxy in front of one).
export default {
  fetch: (request: Request) => {
    if (new URL(request.url).pathname.startsWith('/broken')) {
      return new Response('Internal Server Error', { status: 500 })
    }
    return new Response(JSON.stringify({ hello: 'world' }), {
      headers: { 'content-type': 'application/json' },
    })
  },
}
