import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect'
// expo-router vendors its own copy of react-navigation and re-exports the
// navigators but not this context, so the deep path is how an app reaches
// it. Reading the context rather than calling useBottomTabBarHeight() on
// purpose: the hook throws outside a tab navigator, and these screens are
// also rendered from the root stack (Accounts, and a form during a write).
import { BottomTabBarHeightContext } from 'expo-router/build/react-navigation/bottom-tabs'
import { useContext, useEffect, useState, type JSX } from 'react'
import { AccessibilityInfo, StyleSheet } from 'react-native'

// The tab bar's material. On iOS 26 the bar stops being a painted strip and
// becomes Liquid Glass: it floats over the content, and the ledger scrolls
// underneath it instead of stopping at a hairline.
//
// Everywhere else — Android, older iOS, and iOS with Reduce Transparency on
// — the bar stays exactly what it was: an opaque background with the
// hairline on top. That is the fallback, not a degraded version of the
// glass one, so nothing about the layout depends on which is in play.

// isLiquidGlassAvailable() answers "is this build using the Liquid Glass
// design", which stays true when the user has asked the system to cut the
// effect back. Reduce Transparency is the second half of the question, and
// it is exactly the preference a floating translucent bar has to honour.
export function useGlassTabBar(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    let live = true
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (live) setReduced(value)
    })
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced)
    return () => {
      live = false
      subscription.remove()
    }
  }, [])
  return isLiquidGlassAvailable() && !reduced
}

// How much of the screen's bottom the tab bar is covering. Zero when there
// is no tab bar overhead — a pushed screen owns its own bottom inset.
//
// When the bar is glass it is positioned absolutely, so it no longer takes
// layout space and every scroller under it has to end this far above the
// screen edge. When it is opaque it is in the flow and this is 0 for the
// same reason: content already stops where the bar starts.
export function useTabBarInset(): number {
  const height = useContext(BottomTabBarHeightContext)
  const glass = useGlassTabBar()
  return glass ? (height ?? 0) : 0
}

export function TabBarGlass(): JSX.Element {
  return <GlassView style={StyleSheet.absoluteFill} glassEffectStyle="regular" />
}
