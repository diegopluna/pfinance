import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useThemeColor } from 'heroui-native'
import type { JSX } from 'react'

// The four places the app goes once you are signed in. Everything else —
// the connect flow, the Accounts list, a form — is pushed above this bar by
// the root stack, which is what makes those screens read as somewhere you
// went rather than somewhere you are.
//
// Four, not five: the three dashboards are one Insights tab with a
// switcher, because a tab bar that needs a second row of thinking to parse
// is not doing its job. Accounts stays a push off the home screen — it is a
// list you consult, not a place you live.
//
// **Native tabs, not the JS navigator.** Liquid Glass is only available
// here: on iOS 26 the system draws the bar and derives it from whatever
// scrolls underneath, and no amount of glass placed behind a JS tab bar
// reproduces that. Adopting the system bar means adopting its iconography
// too — SF Symbols on iOS, Material on Android — so the four hand-drawn
// glyphs are gone. That is the honest trade, and it was already the
// argument in their own file: a tab bar is read from the corner of the eye,
// and it is the one place in this app that should look like every other
// app. It also gets the filled-on-selected state the drawn set could not,
// because only two of those four shapes could carry a fill.
//
// What survives is the type: labelStyle takes a fontFamily, so the labels
// stay Geist. They lose the eyebrow's uppercasing and tracking —
// a native label has no text-transform or letterSpacing — so they are
// sentence case, which is what the platform's own bars use anyway.
//
// The bar also owns its content insets now (`disableAutomaticContentInsets`
// is off by default), so no screen pads for it by hand.
const TABS = [
  { name: 'home', title: 'Home', sf: { default: 'house', selected: 'house.fill' }, md: 'home' },
  { name: 'transactions', title: 'Ledger', sf: 'list.bullet', md: 'list' },
  {
    name: 'insights',
    title: 'Insights',
    sf: { default: 'chart.bar', selected: 'chart.bar.fill' },
    md: 'bar_chart',
  },
  {
    name: 'settings',
    title: 'Settings',
    sf: { default: 'gearshape', selected: 'gearshape.fill' },
    md: 'settings',
  },
] as const

export default function TabsLayout(): JSX.Element {
  const [accent, muted] = useThemeColor(['accent', 'muted'])
  const label = { fontFamily: 'Geist_500Medium', fontSize: 11 }

  return (
    <NativeTabs
      tintColor={accent}
      iconColor={{ default: muted, selected: accent }}
      labelStyle={{
        default: { ...label, color: muted },
        selected: { ...label, color: accent },
      }}
      // backgroundColor and blurEffect are deliberately unset: on iOS 26
      // they do nothing, because the system is drawing Liquid Glass from
      // the content behind the bar. Below that, and on Android, the
      // platform's own default bar is the right answer anyway.
    >
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.name} name={tab.name}>
          <NativeTabs.Trigger.Label>{tab.title}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={tab.sf} md={tab.md} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  )
}
