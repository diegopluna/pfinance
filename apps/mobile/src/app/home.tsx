import { call } from '@pfinance/api-client'
import { getCurrency, isSupportedCurrency } from '@pfinance/currency'
import { Redirect, router } from 'expo-router'
import { Button, Spinner, Typography } from 'heroui-native'
import { useEffect, useState, type JSX } from 'react'
import { View } from 'react-native'
import { apiFor } from '@/api/client'
import { failureMessage } from '@/api/use-query'
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
        // 401 means the session is gone (ADR 0005) — failureMessage
        // redirects to sign-in and yields null; the Server connection is
        // intact, so anything else is just this screen's error line.
        const message = failureMessage(failure)
        if (message !== null) setError(message)
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

      {/* Quick entry first (issue #80): recording a Transaction is the
          highest-frequency task in the product (parent issue #70) — one tap
          from launch, straight into the form. Then the read surfaces: the
          three dashboards (issue #79) over the browsable Ledger (issue #78). */}
      <View className="gap-3">
        <Button onPress={() => router.push({ pathname: '/transactions', params: { new: 'true' } })}>
          New transaction
        </Button>
        <Button onPress={() => router.push('/net-worth')}>Net worth</Button>
        <Button onPress={() => router.push('/spending')}>Spending</Button>
        <Button onPress={() => router.push('/income-expense')}>Income vs expense</Button>
        <Button onPress={() => router.push('/accounts')}>Accounts</Button>
        <Button onPress={() => router.push('/transactions')}>Transactions</Button>
        <Button variant="outline" onPress={() => router.push('/settings')}>
          Settings
        </Button>
      </View>
    </Screen>
  )
}
