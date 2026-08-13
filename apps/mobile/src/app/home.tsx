import { ApiError, call } from '@pfinance/api-client'
import { getCurrency, isSupportedCurrency } from '@pfinance/currency'
import { Redirect, router } from 'expo-router'
import { Button, Spinner, Typography } from 'heroui-native'
import { useEffect, useState, type JSX } from 'react'
import { View } from 'react-native'
import { apiFor } from '@/api/client'
import { Screen } from '@/components/screen'
import { storedServerUrl } from '@/connect/store'

// Where sign-in lands, and where every relaunch with a live session opens
// (issue #77): the authenticated identity — the Household's name and
// Currency from /api/me. The shared client replays the secure-store session
// cookie as a header, exactly as the seam test drives the Server.
const fetchMe = (apiUrl: string) =>
  call(apiFor(apiUrl).api.me.$get(), 'Could not load your Household.')

type Me = Awaited<ReturnType<typeof fetchMe>>

// "BRL · Brazilian Real" — the code always renders; the display name only
// for Currencies this build knows (a newer Server may know more).
const currencyLine = (code: string): string =>
  isSupportedCurrency(code) ? `${code} · ${getCurrency(code).name}` : code

export default function HomeScreen(): JSX.Element {
  const apiUrl = storedServerUrl()
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (apiUrl === null) return
    let cancelled = false
    setMe(null)
    setError(null)
    fetchMe(apiUrl).then(
      (body) => {
        if (!cancelled) setMe(body)
      },
      (failure: unknown) => {
        if (cancelled) return
        // 401 means the session is gone — expired (ADR 0005) or revoked from
        // another device. The Server connection is intact; ask for
        // credentials again rather than restarting the connect flow.
        if (failure instanceof ApiError && failure.status === 401) {
          router.replace('/sign-in')
          return
        }
        setError(failure instanceof Error ? failure.message : 'Could not load your Household.')
      },
    )
    return () => {
      cancelled = true
    }
  }, [apiUrl, attempt])

  if (apiUrl === null) return <Redirect href="/" />

  if (me === null && error === null) {
    return (
      <Screen>
        <View className="items-center gap-4">
          <Spinner size="lg" />
          <Typography.Paragraph color="muted" align="center">
            Loading your Household…
          </Typography.Paragraph>
        </View>
      </Screen>
    )
  }

  if (me === null) {
    return (
      <Screen>
        <View className="gap-2">
          <Typography.Heading type="h2">Can&apos;t reach your Server</Typography.Heading>
          <Typography.Paragraph color="muted">{error}</Typography.Paragraph>
        </View>
        <View className="gap-3">
          <Button onPress={() => setAttempt((n) => n + 1)}>Try again</Button>
          <Button variant="ghost" onPress={() => router.push('/settings')}>
            Settings
          </Button>
        </View>
      </Screen>
    )
  }

  return (
    <Screen>
      <View className="gap-2">
        <Typography.Heading type="h2">{me.household.name}</Typography.Heading>
        <Typography.Paragraph color="muted">
          {currencyLine(me.household.currency)}
        </Typography.Paragraph>
        <Typography.Paragraph type="body-sm" color="muted">
          Signed in as {me.user.email}
        </Typography.Paragraph>
      </View>

      {/* The Ledger is browsable (issue #78): Accounts with Balances and
          the filterable Transaction list. Writes still land in updates. */}
      <View className="gap-3">
        <Button onPress={() => router.push('/accounts')}>Accounts</Button>
        <Button onPress={() => router.push('/transactions')}>Transactions</Button>
        <Button variant="outline" onPress={() => router.push('/settings')}>
          Settings
        </Button>
      </View>
    </Screen>
  )
}
