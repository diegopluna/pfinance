import { probeConnection, type ConnectionState } from '@pfinance/api-client'
import * as Linking from 'expo-linking'
import { router, useLocalSearchParams } from 'expo-router'
import { Button, Spinner, Typography } from 'heroui-native'
import { useEffect, useState, type JSX } from 'react'
import { View } from 'react-native'
import { Screen } from '@/components/screen'
import { connectStateContent, supportedApiVersions } from '@/connect/content'

// A Server that accepts the TCP connection but never answers would otherwise
// pin the spinner forever — the platform fetch has no default deadline.
const PROBE_TIMEOUT_MS = 10_000

const fetchWithTimeout: typeof fetch = async (input, init) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Both entry paths — the typed address and the scanned QR code — land here
// with the raw input, and this screen runs the shared probe on it. The five
// connection states (issue #73) each render as their own designed screen;
// the copy lives in src/connect/content.ts, tested in apps/mobile/test.
export default function StatusScreen(): JSX.Element {
  const { input } = useLocalSearchParams<{ input?: string }>()
  const [result, setResult] = useState<ConnectionState | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setResult(null)
    // probeConnection resolves for every input — network failures (the
    // timeout abort included) classify as 'unreachable', they don't reject.
    void probeConnection(input ?? '', supportedApiVersions, fetchWithTimeout).then((state) => {
      if (!cancelled) setResult(state)
    })
    return () => {
      cancelled = true
    }
  }, [input, attempt])

  return (
    <Screen>
      {result === null ? (
        <Probing input={input ?? ''} />
      ) : (
        <StateScreen result={result} retry={() => setAttempt((n) => n + 1)} />
      )}
    </Screen>
  )
}

function Probing({ input }: { input: string }): JSX.Element {
  return (
    <>
      <View className="items-center gap-4">
        <Spinner size="lg" />
        <Typography.Paragraph color="muted" align="center">
          Checking {input}…
        </Typography.Paragraph>
      </View>
      <Button variant="ghost" onPress={() => router.back()}>
        Cancel
      </Button>
    </>
  )
}

function StateScreen({
  result,
  retry,
}: {
  result: ConnectionState
  retry: () => void
}): JSX.Element {
  const content = connectStateContent(result)
  const { docsUrl } = content
  const changeAddress = () => router.back()

  return (
    <>
      <View className="gap-2">
        <Typography.Heading type="h2">{content.title}</Typography.Heading>
        <Typography.Paragraph color="muted">{content.body}</Typography.Paragraph>
        {content.detail !== undefined && (
          <Typography.Paragraph type="body-sm" color="muted">
            {content.detail}
          </Typography.Paragraph>
        )}
        {'apiUrl' in result && (
          <Typography.Paragraph type="body-sm" color="muted">
            {result.apiUrl}
          </Typography.Paragraph>
        )}
      </View>

      <View className="gap-3">
        {result.state === 'connected' && (
          <Button
            onPress={() => router.push({ pathname: '/sign-in', params: { apiUrl: result.apiUrl } })}
          >
            Sign in
          </Button>
        )}
        {docsUrl !== undefined && (
          <Button onPress={() => void Linking.openURL(docsUrl)}>Open the self-hosting guide</Button>
        )}
        {result.state === 'unreachable' && <Button onPress={retry}>Try again</Button>}
        {(result.state === 'server-too-old' || result.state === 'app-too-old') && (
          <Button variant="outline" onPress={retry}>
            Check again
          </Button>
        )}
        {result.state !== 'connected' && (
          <Button
            variant={result.state === 'not-a-server' ? 'primary' : 'ghost'}
            onPress={changeAddress}
          >
            Change address
          </Button>
        )}
      </View>
    </>
  )
}
