import { Redirect, useLocalSearchParams } from 'expo-router'
import { useState, type JSX } from 'react'
import { View } from 'react-native'
import { IncomeExpenseView } from '@/components/dashboards/income-expense-view'
import { NetWorthView } from '@/components/dashboards/net-worth-view'
import { SpendingView } from '@/components/dashboards/spending-view'
import { ListScreen } from '@/components/list-screen'
import { Touchable } from '@/components/touchable'
import { Eyebrow } from '@/components/type'
import { storedServerUrl } from '@/connect/store'

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
      <Switcher view={view} onChange={setView} />
      {view === 'net-worth' && <NetWorthView />}
      {view === 'spending' && <SpendingView />}
      {view === 'income-expense' && <IncomeExpenseView />}
    </ListScreen>
  )
}

// Three mutually exclusive views of one ledger, so: one row, equal widths,
// and a segmented track.
//
// It was an underline under bare labels first, which put the switcher in
// exactly the same type as the section eyebrows above it — the only thing
// saying "press me" was a 3px rule under one of the three. This design
// avoids filled surfaces everywhere else, but a control that reads as a
// caption is the wrong place to spend that consistency. The track is
// neutral, not accent: better-colors keeps the filled-accent treatment for
// the single primary action.
//
// The radii are concentric: an 8px track with 4px of padding needs a 4px
// thumb, or the inner corners look pinched against the outer ones.
function Switcher({
  view,
  onChange,
}: {
  view: Dashboard
  onChange: (view: Dashboard) => void
}): JSX.Element {
  return (
    <View className="flex-row rounded-lg bg-surface-secondary p-1">
      {VIEWS.map((entry) => {
        const open = entry.value === view
        return (
          <Touchable
            key={entry.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: open }}
            onPress={() => onChange(entry.value)}
            className={`flex-1 items-center rounded-sm py-2 ${open ? 'bg-background' : ''}`}
          >
            {/* Both states are full contrast: muted on the track measured
                4.34:1, under the 4.5:1 an 11px label needs, and the whole
                point of the track was to stop this row reading as text. The
                raised thumb carries the selection, the way a platform
                segmented control does. */}
            <Eyebrow tone="foreground">{entry.label}</Eyebrow>
          </Touchable>
        )
      })}
    </View>
  )
}
