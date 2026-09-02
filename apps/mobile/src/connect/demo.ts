// The demo Server (issue #85): a stock pfinance deployment on its own stage,
// seeded with a sample Household and reset nightly by CI
// (.github/workflows/demo-reset.yml, docs/demo-server.md). The app embeds
// only the URL and the shared credentials — "Try the demo" runs the same
// probe → sign-in path as any other Server, just with these values.
//
// The demo API's custom domain — stable across the nightly destroy →
// recreate cycle, which a workers.dev URL is not (its worker-name suffix is
// per-create). Were this ever empty again, the connect screen simply
// wouldn't offer the demo — a dead button would be worse than none.
export const DEMO_SERVER_URL: string = 'https://goblin-demo-api.dpeter.dev'

export const DEMO_EMAIL = 'demo@example.com'
export const DEMO_PASSWORD = 'try-the-demo'

export const demoConfigured = (): boolean => DEMO_SERVER_URL !== ''
