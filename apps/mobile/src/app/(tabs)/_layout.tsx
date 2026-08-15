import { Tabs } from 'expo-router/js-tabs'
import { useThemeColor } from 'heroui-native'
import type { JSX } from 'react'
import { TabIcon, type TabName } from '@/components/tab-icon'
import { TabBarGlass, useGlassTabBar } from '@/shell/tab-bar'

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
// Labels are the app's eyebrow: mono, uppercase, letterspaced (the type
// scale in docs/design/MOBILE.md), so the bar is in the same voice as every
// section heading above it.
//
// On iOS 26 the bar is Liquid Glass and floats: it leaves the layout flow,
// and the ledger passes underneath it rather than stopping at a hairline.
// The labels and the hand-drawn icons are unchanged either way — that is
// why the glass goes behind this bar instead of the app adopting native
// tabs, which would trade the whole type and icon system for SF Symbols.
// shell/tab-bar.tsx owns the decision and the inset it costs.
const TABS: { name: string; title: string; icon: TabName }[] = [
  { name: 'home', title: 'Home', icon: 'home' },
  { name: 'transactions', title: 'Ledger', icon: 'ledger' },
  { name: 'insights', title: 'Insights', icon: 'insights' },
  { name: 'settings', title: 'Settings', icon: 'settings' },
]

export default function TabsLayout(): JSX.Element {
  const [accent, muted, background, separator] = useThemeColor([
    'accent',
    'muted',
    'background',
    'separator',
  ])

  const glass = useGlassTabBar()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
        // Glass draws its own edge, so the hairline and the painted
        // background come off and the bar leaves the layout flow. Opaque
        // keeps both: the platform's own elevation would draw a second edge
        // over the hairline, and this app is flat everywhere else — one
        // line is the whole vocabulary for a boundary.
        tabBarStyle: glass
          ? {
              position: 'absolute',
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              elevation: 0,
            }
          : {
              backgroundColor: background,
              borderTopColor: separator,
              borderTopWidth: 1,
              elevation: 0,
            },
        tabBarBackground: glass ? () => <TabBarGlass /> : undefined,
        tabBarLabelStyle: {
          fontFamily: 'SplineSansMono_500Medium',
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
        },
        tabBarItemStyle: { paddingTop: 6 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => <TabIcon name={tab.icon} color={color} />,
          }}
        />
      ))}
    </Tabs>
  )
}
