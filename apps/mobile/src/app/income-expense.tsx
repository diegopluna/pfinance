import { call } from '@pfinance/api-client'
import { formatAmount } from '@pfinance/currency'
import { Redirect } from 'expo-router'
import { Typography } from 'heroui-native'
import { useCallback, type JSX } from 'react'
import { ScrollView, View } from 'react-native'
import { apiFor } from '@/api/client'
import { useHousehold } from '@/api/use-household'
import { useApiQuery } from '@/api/use-query'
import { monthLabel } from '@/charts/months'
import { IncomeExpenseChart } from '@/components/charts/income-expense-chart'
import { ListScreen, ListStatus } from '@/components/list-screen'
import { storedServerUrl } from '@/connect/store'

// The Income vs Expense dashboard (issue #79): the server-summed recent
// window (issue #19) as paired bars — the "am I saving anything" view. No
// month stepper, the web card's stance: the window always ends at the
// current month, so the screen reads as a standing answer rather than a
// browsable slice. A phone has no tooltips, so the latest month's exact
// amounts render as text below the chart, through the shared currency
// package (ADR 0006). Transfers and Balance Adjustments are excluded by
// definition — the server derives the views; this screen only says so.

export default function IncomeExpenseScreen(): JSX.Element {
  const apiUrl = storedServerUrl()

  const { me, currency } = useHousehold(apiUrl)
  const fetchIncomeExpense = useCallback(
    () =>
      call(
        apiFor(apiUrl ?? '').api['income-vs-expense'].$get({ query: { through: undefined } }),
        'Could not load income vs expense.',
      ),
    [apiUrl],
  )
  const incomeExpense = useApiQuery(apiUrl === null ? null : fetchIncomeExpense)

  if (apiUrl === null) return <Redirect href="/" />

  const error = me.error ?? incomeExpense.error
  const retry = () => {
    if (me.error !== null) me.retry()
    if (incomeExpense.error !== null) incomeExpense.retry()
  }
  const loaded = me.data !== null && incomeExpense.data !== null
  const months = incomeExpense.data?.months ?? []
  const latest = months.at(-1)

  return (
    <ListScreen title="Income vs expense">
      {error !== null || !loaded ? (
        <ListStatus error={error} retry={retry} />
      ) : months.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          empty="The chart starts with the ledger — it appears once there are income or expense transactions."
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <IncomeExpenseChart months={months} />
          {latest !== undefined && (
            <View className="mt-4 gap-1">
              <Typography.Paragraph type="body-sm" className="font-medium">
                {monthLabel(latest.month, 'full')}
              </Typography.Paragraph>
              <Typography.Paragraph type="body-sm" color="muted">
                Income {formatAmount(latest.income, currency)} · Expense{' '}
                {formatAmount(latest.expense, currency)}
              </Typography.Paragraph>
            </View>
          )}
          {/* By definition (DECISIONS.md): every derived-spending surface
              carries this footnote visibly. */}
          <Typography.Paragraph type="body-sm" color="muted" className="mt-4">
            Excludes transfers and adjustments
          </Typography.Paragraph>
        </ScrollView>
      )}
    </ListScreen>
  )
}
