// The demo Server (issue #85): a stock Goblin deployment on its own stage,
// seeded with a sample Household and reset nightly by CI
// (.github/workflows/demo-reset.yml, docs/demo-server.md). The app embeds
// only the URL and the shared credentials — "Try the demo" runs the same
// probe → sign-in path as any other Server, just with these values.
//
// The URL is stamped after the demo stage's first deploy (it is that
// deployment's workers.dev address). While it is empty, the connect screen
// simply doesn't offer the demo — a dead button would be worse than none.
export const DEMO_SERVER_URL = ''

export const DEMO_EMAIL = 'demo@example.com'
export const DEMO_PASSWORD = 'try-the-demo'

export const demoConfigured = (): boolean => DEMO_SERVER_URL !== ''
