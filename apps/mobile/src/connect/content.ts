import type { ApiMeta, ConnectionState, SupportedApiVersions } from '@pfinance/api-client'

// The apiVersion range this app build supports (ADR 0007). The ceiling is
// the workspace's own contract version — the app is built against this
// workspace's server types, and a test pins the two together. The floor is a
// deliberate choice: raise it only when the app stops speaking to older
// Servers. Kept as a literal (not imported from the server package) so Metro
// never bundles server code.
export const supportedApiVersions: SupportedApiVersions = {
  minApiVersion: 1,
  maxApiVersion: 1,
}

// Where "Server too old" sends the user: Goblin is fork-and-deploy, so the
// one URL that exists for every install is the canonical repository. Its
// "Host your own" section links on to the quickstart that walks through
// pulling and redeploying.
export const SELF_HOSTING_DOCS_URL = 'https://github.com/diegopluna/pfinance#host-your-own'

export interface ConnectStateContent {
  title: string
  body: string
  // Version diagnostics, present exactly when the Server reported a version —
  // a pre-ADR-0007 Server (404 on /api/meta) has nothing to report.
  detail?: string
  // Only server-too-old carries this: the fix is redeploying the Server, and
  // the docs are the path there.
  docsUrl?: string
}

const versionDetail = (meta: ApiMeta | undefined): string | undefined =>
  meta === undefined
    ? undefined
    : `The Server speaks API version ${meta.apiVersion}; this app speaks ${
        supportedApiVersions.minApiVersion === supportedApiVersions.maxApiVersion
          ? supportedApiVersions.maxApiVersion
          : `${supportedApiVersions.minApiVersion} to ${supportedApiVersions.maxApiVersion}`
      }.`

// The app's only logic over the shared probe: ConnectionState → screen copy.
// Free of react-native imports on purpose, so the workspace's node test
// runner covers it (apps/mobile/test).
export const connectStateContent = (state: ConnectionState): ConnectStateContent => {
  switch (state.state) {
    case 'unreachable':
      return {
        title: "Can't reach that address",
        body: 'Nothing answered there. Check the address and your connection, then try again.',
      }
    case 'not-a-server':
      return {
        title: 'Not a Goblin Server',
        body: 'Something answered, but it isn’t Goblin. Enter your Server’s address — or your web app’s address, which also works.',
      }
    case 'server-too-old':
      return {
        title: 'Your Server needs updating',
        body: 'This app needs a newer Server. Pull the latest Goblin and redeploy — the self-hosting guide walks through it.',
        detail: versionDetail(state.meta),
        docsUrl: SELF_HOSTING_DOCS_URL,
      }
    case 'app-too-old':
      return {
        title: 'Update this app',
        body: 'Your Server is newer than this app. Install the latest version from the app store, then try again.',
        detail: versionDetail(state.meta),
      }
    case 'connected':
      return {
        title: 'Connected',
        body: 'This Server is ready. Sign in with the email and password you use on the web.',
        detail: versionDetail(state.meta),
      }
  }
}
