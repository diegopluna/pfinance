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
const wellKnownPairing = (): Plugin => {
  let apiUrl: string | undefined
  return {
    name: 'pfinance:well-known-pairing',
    configResolved(config) {
      apiUrl = config.env.VITE_API_URL as string | undefined
    },
    configureServer(server) {
      server.middlewares.use('/.well-known/pfinance.json', (_req, res, next) => {
        // Without an API URL (plain `vp dev`, no alchemy) fall through to
        // the SPA — the same answer a host without the file gives.
        if (!apiUrl) return next()
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ apiUrl }))
      })
    },
    generateBundle() {
      if (!apiUrl) {
        // A bare `vp build` (no alchemy env) has no API URL to publish;
        // deploys always do (alchemy.run.ts threads VITE_API_URL).
        this.warn('VITE_API_URL is not set — skipping .well-known/pfinance.json')
        return
      }
      this.emitFile({
        type: 'asset',
        fileName: '.well-known/pfinance.json',
        source: JSON.stringify({ apiUrl }),
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
