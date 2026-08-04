// Single source of the browser-origin policy, consumed by both the CORS
// middleware and Better Auth's trustedOrigins so they can never drift.
//
// WEB_ORIGIN pins the deployed web app's origin. When it's unset (local dev,
// PR previews, tests — where the workers.dev URL isn't knowable up front) we
// fall back to trusting all of workers.dev; production deployments should set
// WEB_ORIGIN, since anyone can deploy to the workers.dev suffix.
export const trustedOrigins = (env: { WEB_ORIGIN: string }) =>
  env.WEB_ORIGIN
    ? ['http://localhost:3000', env.WEB_ORIGIN]
    : ['http://localhost:3000', 'https://*.workers.dev']

export const matchesTrustedOrigin = (origin: string, patterns: string[]) =>
  patterns.some((pattern) =>
    pattern.includes('*')
      ? new RegExp(
          `^${pattern.replace(/[.]/g, '\\.').replace(/\*/g, '[\\w-]+(\\.[\\w-]+)*')}$`,
        ).test(origin)
      : pattern === origin,
  )
