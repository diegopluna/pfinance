import { formatAmount, type CurrencyCode } from '@pfinance/currency'
import type { JSX } from 'react'
import { ScrollView, View } from 'react-native'
import { queryFailure } from '@/api/errors'
import { useIncomeExpense } from '@/api/use-dashboards'
import { useHousehold } from '@/api/use-me'
import { monthLabel } from '@/charts/months'
import { Figure } from '@/components/amount'
import { IncomeExpenseChart } from '@/components/charts/income-expense-chart'
import { ListStatus } from '@/components/list-screen'
import { Body, Eyebrow } from '@/components/type'

// The Income vs Expense dashboard (issue #79): the server-summed recent
// window (issue #19) on the rail — the "am I saving anything" view. No
// month stepper, the web card's stance: the window always ends at the
// current month, so the screen reads as a standing answer rather than a
// browsable slice. A phone has no tooltips, so the latest month is stated
// in full above the window, through the shared currency package (ADR 0006),
// and the months behind it carry their shape. Transfers and Balance
// Adjustments are excluded by definition — the server derives the views;
// this screen only says so.

export function IncomeExpenseView(): JSX.Element {
  const { me, currency } = useHousehold()
  const incomeExpense = useIncomeExpense()

  const { error, retry } = queryFailure([me, incomeExpense])
  const loaded = me.data !== undefined && incomeExpense.data !== undefined
  const months = incomeExpense.data?.months ?? []
  const latest = months.at(-1)

  return (
    <>
      {error !== null || !loaded ? (
        <ListStatus error={error} retry={retry} />
      ) : months.length === 0 ? (
        <ListStatus
          error={null}
          retry={retry}
          empty="This fills in once the ledger has income or expense transactions."
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
          {latest !== undefined && <LatestMonth month={latest} currency={currency} />}
          <View className="mt-7">
            <IncomeExpenseChart months={months} currency={currency} />
          </View>
          {/* By definition (DECISIONS.md): every derived-spending surface
              carries this footnote visibly. */}
          <Body size="sm" tone="muted" className="pt-6 pb-4">
            Excludes transfers and adjustments
          </Body>
        </ScrollView>
      )}
    </>
  )
}

// The month in hand, stated rather than plotted. Net is the line the bars
// imply but never say: what this month did to the household's net worth.
function LatestMonth({
  month,
  currency,
}: {
  month: { month: string; income: number; expense: number }
  currency: CurrencyCode
}): JSX.Element {
  const net = month.income - month.expense
  return (
    <View className="gap-2.5">
      <Eyebrow>{monthLabel(month.month, 'full')}</Eyebrow>
      <Row label="Income" value={formatAmount(month.income, currency)} />
      <Row label="Expenses" value={formatAmount(month.expense, currency)} />
      <View className="mt-1 border-separator border-t pt-2.5">
        <Row
          label="Kept"
          value={`${net > 0 ? '+' : ''}${formatAmount(net, currency)}`}
          tone={net < 0 ? 'negative' : 'positive'}
          size="lg"
        />
      </View>
    </View>
  )
}

function Row({
  label,
  value,
  tone = 'plain',
  size = 'base',
}: {
  label: string
  value: string
  tone?: 'plain' | 'positive' | 'negative'
  size?: 'base' | 'lg'
}): JSX.Element {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Body tone="muted">{label}</Body>
      <Figure size={size} tone={tone}>
        {value}
      </Figure>
    </View>
  )
}
