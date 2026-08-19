import type { JSX } from 'react'
import { useColorScheme, View } from 'react-native'
import { chartPalette } from '@/charts/palette'
import { staleLabel } from '@/api/staleness'
import { Touchable } from '@/components/touchable'
import { Body } from '@/components/type'

// The cached-data indicator (issue #83): one quiet line under a screen's
// header when it is showing data whose refresh failed. The dot is the
// Settings Connected dot's neutral sibling — same shape, drained of color —
// and the text carries the meaning, never the dot alone. The age quotes
// the cache's own updated-at (api/staleness.ts). accessibilityLiveRegion:
// the banner appearing IS the news; a screen reader hears it without
// hunting for it.
export function OfflineBanner({
  updatedAt,
  retry,
}: {
  /** The oldest dataUpdatedAt among the screen's shown queries. */
  updatedAt: number | null
  retry: () => void
}): JSX.Element {
  const palette = chartPalette(useColorScheme())
  return (
    <View className="flex-row items-center gap-2">
      <View
        aria-hidden
        className="rounded-full"
        style={{ width: 7, height: 7, backgroundColor: palette.uncategorized }}
      />
      <Body size="sm" tone="muted" className="flex-1" accessibilityLiveRegion="polite">
        Showing saved data
        {updatedAt === null ? '' : ` from ${staleLabel(updatedAt, Date.now())}`}
      </Body>
      <Touchable
        accessibilityRole="button"
        accessibilityLabel="Retry loading"
        hitSlop={12}
        onPress={retry}
      >
        <Body size="sm" className="font-medium text-accent">
          Retry
        </Body>
      </Touchable>
    </View>
  )
}
