import { expect, test } from 'vite-plus/test'
import type { ApiMeta, ConnectionState } from '@pfinance/api-client'
import { apiMeta } from '../../server/src/compat.ts'
import {
  SELF_HOSTING_DOCS_URL,
  connectStateContent,
  supportedApiVersions,
} from '../src/connect/content.ts'

// --- The connect flow's render seam (issue #76) ---
// The shared probe classifies (tested at the HTTP seam in apps/server/test);
// this module is the app's only logic on top of it — a pure mapping from
// ConnectionState to screen copy, deliberately free of react-native imports
// so it runs under the workspace's node test runner.

const meta = (apiVersion: number): ApiMeta => ({
  product: 'pfinance',
  apiVersion,
  serverVersion: '9.9.9',
})

// One instance of each of the five states (issue #73).
const allStates: ConnectionState[] = [
  { state: 'unreachable' },
  { state: 'not-a-server' },
  { state: 'server-too-old', apiUrl: 'https://api.example.com' },
  { state: 'app-too-old', apiUrl: 'https://api.example.com', meta: meta(99) },
  { state: 'connected', apiUrl: 'https://api.example.com', meta: meta(1) },
]

test('the supported range tracks the workspace apiVersion', () => {
  // The app is built from the same workspace as the server types it calls,
  // so its ceiling must be that server's apiVersion — if this fails, the
  // contract bumped and supportedApiVersions was not revisited.
  expect(supportedApiVersions.maxApiVersion).toBe(apiMeta.apiVersion)
  expect(supportedApiVersions.minApiVersion).toBeLessThanOrEqual(supportedApiVersions.maxApiVersion)
})

test('each of the five states gets its own screen copy', () => {
  const titles = new Set(allStates.map((state) => connectStateContent(state).title))
  expect(titles.size).toBe(allStates.length)
})

test('server-too-old links to the self-hosting docs; no other state does', () => {
  for (const state of allStates) {
    expect(connectStateContent(state).docsUrl).toBe(
      state.state === 'server-too-old' ? SELF_HOSTING_DOCS_URL : undefined,
    )
  }
})

test('version diagnostics appear exactly when the Server reported a version', () => {
  // A pre-ADR-0007 Server (404 on /api/meta) has no version to report.
  const silent = connectStateContent({ state: 'server-too-old', apiUrl: 'https://api.example.com' })
  expect(silent.detail).toBeUndefined()

  const reported = connectStateContent({
    state: 'server-too-old',
    apiUrl: 'https://api.example.com',
    meta: meta(0),
  })
  expect(reported.detail).toContain('0')

  const newer = connectStateContent({
    state: 'app-too-old',
    apiUrl: 'https://api.example.com',
    meta: meta(99),
  })
  expect(newer.detail).toContain('99')
})
