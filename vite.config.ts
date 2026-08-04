import { defineConfig } from 'vite-plus'

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    semi: false,
    singleQuote: true,
    // Generated drizzle migration output — leave byte-for-byte as generated.
    ignorePatterns: ['packages/db/migrations/**'],
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ['packages/db/migrations/**'],
  },
  run: {
    cache: true,
  },
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 600_000,
    // Test files deploy/destroy the shared test stage; running them in
    // parallel would race on the same stack state.
    fileParallelism: false,
  },
})
