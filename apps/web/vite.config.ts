import path from 'node:path'
import { defineConfig, type Plugin } from 'vite-plus'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { lazyPlugins } from 'vite-plus'

// The mobile pairing file (issue #74): a Member who types the web address
// into the app is redirected to the API by the probe following this
// origin-rooted file (WELL_KNOWN_PATH in @pfinance/api-client — path and
// `{ apiUrl }` payload are that contract, exercised end to end in
// apps/server/test/connection.test.ts). Emitted at build time because that
// is when the web app learns its API URL, and served in dev so a local
// stack pairs the same way.
// Mirrors WELL_KNOWN_PATH in @pfinance/api-client (not imported: pulling the
// client's TS sources into the config's tsconfig.node project would drag the
// whole server type graph along). Drift is caught by the end-to-end probe
// test cited above.
const WELL_KNOWN_PATH = '/.well-known/pfinance.json'

const wellKnownPairing = (): Plugin => {
  let apiUrl: string | undefined
  const pairingBody = () => JSON.stringify({ apiUrl })
  return {
    name: 'pfinance:well-known-pairing',
    configResolved(config) {
      // Alchemy deploys don't set VITE_API_URL as process env — they inject
      // it purely as a define replacement (getDefine in alchemy's
      // Cloudflare/Workers/Vite), so it never reaches config.env. Read the
      // define first (a JSON-stringified literal), fall back to config.env
      // for a plain `vp build`/`vp dev` with the variable exported.
      const defined = config.define?.['import.meta.env.VITE_API_URL'] as unknown
      const parsed = typeof defined === 'string' ? (JSON.parse(defined) as unknown) : undefined
      apiUrl =
        typeof parsed === 'string' && parsed !== ''
          ? parsed
          : (config.env.VITE_API_URL as string | undefined)
    },
    configureServer(server) {
      server.middlewares.use(WELL_KNOWN_PATH, (req, res, next) => {
        // Without an API URL (plain `vp dev`, no alchemy) fall through to
        // the SPA — the same answer a host without the file gives. Connect
        // prefix-matches, so also decline sub-paths of the file.
        if (!apiUrl || (req.url !== '/' && req.url !== '')) return next()
        res.setHeader('content-type', 'application/json')
        res.end(pairingBody())
      })
    },
    generateBundle() {
      if (!apiUrl) {
        // A bare `vp build` (no alchemy env) has no API URL to publish;
        // deploys always do (alchemy.run.ts threads VITE_API_URL).
        this.warn(`VITE_API_URL is not set — skipping ${WELL_KNOWN_PATH}`)
        return
      }
      this.emitFile({
        type: 'asset',
        fileName: WELL_KNOWN_PATH.slice(1),
        source: pairingBody(),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  lint: {
    plugins: ['react', 'typescript', 'oxc'],
    rules: {
      'react/rules-of-hooks': 'error',
      'react/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
        },
      ],
      'vite-plus/prefer-vite-plus-imports': 'error',
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: 'vite-plus',
        specifier: 'vite-plus/oxlint-plugin',
      },
    ],
  },
  plugins: lazyPlugins(() => [
    // Must run before the react plugin: generates src/routeTree.gen.ts from
    // src/routes/ (file-based routing).
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    wellKnownPairing(),
  ]),
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
