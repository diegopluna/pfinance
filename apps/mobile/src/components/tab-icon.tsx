import type { JSX } from 'react'
import type { ColorValue } from 'react-native'
import Svg, { Path } from 'react-native-svg'

// The tab bar's four glyphs, drawn here for the same reason the chevron is
// (components/chevron.tsx): no icon dependency, one stroke weight, one
// language.
//
// They are deliberately the conventional shapes. The first cut drew Ledger
// and Insights out of the app's own rail — rows hanging off a rule, the
// diverging pair — and at 24px both collapsed into a plus sign. A tab bar
// is read in a glance from the corner of the eye; it is the one place in
// this app that should look like every other app.
//
// A focused tab changes color and nothing else. Filling a line icon on
// selection means drawing every glyph twice, and the label plus the accent
// already say which tab is open.

export type TabName = 'home' | 'ledger' | 'insights' | 'settings'

const PATHS: Record<TabName, string[]> = {
  // A roof over a door.
  home: ['M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z'],
  // A list: rows with their bullets, so it can't be mistaken for the
  // sliders two tabs over.
  ledger: ['M9 7h11', 'M9 12h11', 'M9 17h7'],
  // Bars off a baseline. The baseline is 18, not 20: drawn to the bottom
  // of the viewBox the bars occupied y 9–20 against the y 4–20, 7–17 and
  // 8–16 of their neighbours, and the whole glyph sat visibly low in the
  // bar. This centres it with the slight bottom weight a bar chart wants,
  // and spreads the bars to x 5-19 so the glyph carries the same optical
  // width as the 4-20 of the three it sits beside.
  insights: ['M5 18v-5', 'M12 18v-11', 'M19 18v-8'],
  // Sliders rather than a gear: a gear's teeth turn to mud at 24px.
  settings: ['M4 8h10', 'M18 8h2', 'M4 16h4', 'M12 16h8'],
}

// Round caps drawn at a fat stroke: a dot that scales with the icon instead
// of needing its own circle. The list's bullets, and the sliders' knobs.
const KNOBS: Partial<Record<TabName, { d: string }[]>> = {
  ledger: [{ d: 'M4.5 7h.01' }, { d: 'M4.5 12h.01' }, { d: 'M4.5 17h.01' }],
  settings: [{ d: 'M16 8h.01' }, { d: 'M8 16h.01' }],
}

export function TabIcon({
  name,
  color,
  size = 24,
}: {
  name: TabName
  // Whatever the navigator hands the icon for this tab's state.
  color: ColorValue
  size?: number
}): JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {PATHS[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {KNOBS[name]?.map(({ d }) => (
        <Path key={d} d={d} stroke={color} strokeWidth={3.5} strokeLinecap="round" />
      ))}
    </Svg>
  )
}
