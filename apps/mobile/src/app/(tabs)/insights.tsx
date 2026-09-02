import { Redirect, useLocalSearchParams } from 'expo-router'
import { useState, type JSX } from 'react'
import Animated from 'react-native-reanimated'
import { IncomeExpenseView } from '@/components/dashboards/income-expense-view'
import { NetWorthView } from '@/components/dashboards/net-worth-view'
import { SpendingView } from '@/components/dashboards/spending-view'
import { ListScreen } from '@/components/list-screen'
import { Segmented } from '@/components/segmented'
import { storedServerUrl } from '@/connect/store'
import { rise } from '@/motion'

// The three dashboards (issue #79) behind one tab. They were three
// destinations when the home screen was a menu; a tab bar can't carry three
// slots that all mean "a chart", so they share a tab and a switcher.
//
// A switcher rather than one long scroll: each dashboard reads a different
// window — net worth runs to the first month of the ledger, income vs
// expense holds twelve, spending is one calendar month with a stepper — and
// stacking them would put three time frames under one scrollbar with a
// month stepper that only governs the bottom third.

const VIEWS = [
  { value: 'net-worth', label: 'Net worth' },
  { value: 'spending', label: 'Spending' },
  // Not "Income": the view is both sides of the month, and it borrows the
  // form's own words for them (Money in / Money out).
  { value: 'income-expense', label: 'In vs out' },
] as const

type Dashboard = (typeof VIEWS)[number]['value']

const isDashboard = (value: string | undefined): value is Dashboard =>
  VIEWS.some((entry) => entry.value === value)

export default function InsightsScreen(): JSX.Element {
  const apiUrl = storedServerUrl()
  // Home links straight at a dashboard — the net-worth headline at its own
  // history, this month's bars at the months behind them — so the tab opens
  // where it was pointed rather than always at the first switch.
  const { view: requested } = useLocalSearchParams<{ view?: string }>()
  const [view, setView] = useState<Dashboard>(isDashboard(requested) ? requested : 'net-worth')

  if (apiUrl === null) return <Redirect href="/" />

  return (
    <ListScreen title="Insights" back={false}>
      <Segmented choices={VIEWS} value={view} onChange={setView} />
      {/* Keyed by view: a switch is the next dashboard arriving under the
          same chrome (docs/design/MOTION.md), the same rise as the forms.
          The outgoing one just leaves — two dashboards in the same slot
          would fight for the height. */}
      <Animated.View key={view} entering={rise} style={{ flex: 1 }}>
        {view === 'net-worth' && <NetWorthView />}
        {view === 'spending' && <SpendingView />}
        {view === 'income-expense' && <IncomeExpenseView />}
      </Animated.View>
    </ListScreen>
  )
}
