// A deployable stand-in for the web app's static host: SPA-style 200 HTML on
// every path (exactly what the real host answers for /api/meta — see
// notFoundHandling in alchemy.run.ts) plus the well-known pairing file
// pointing at the API worker. Emitting the file from the real web build is a
// separate ticket; this stub serves the same contract so the probe's
// fallback is exercised over live HTTP.
interface Env {
  API_URL: string
}

export default {
  fetch: (request: Request, env: Env) => {
    if (new URL(request.url).pathname === '/.well-known/pfinance.json') {
      return new Response(JSON.stringify({ apiUrl: env.API_URL }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response('<!doctype html><title>pfinance</title>', {
      headers: { 'content-type': 'text/html' },
    })
  },
}
