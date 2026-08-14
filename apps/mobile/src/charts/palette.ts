// The CVD-validated chart palette (docs/design/DECISIONS.md), keyed by the
// device color scheme. The design mirror's values are sRGB hex — exactly
// what react-native-svg consumes, so unlike the web's OKLCH tokens no
// conversion step exists to lose the validated CVD property. The five slots
// walk spending rank order; Uncategorized always renders the neutral grey —
// a deliberate sixth slot, never one of the five. Net worth is slot 1 over
// the low-alpha area fill, and income vs expense is the slot 1 / slot 2
// opposition, mirroring the web charts.

export interface ChartPalette {
  slots: readonly [string, string, string, string, string]
  uncategorized: string
  /** The net-worth area fill: slot 1 at low alpha, per theme. */
  area: string
  netWorth: string
  income: string
  expense: string
}

const light: ChartPalette = {
  slots: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  uncategorized: '#a1a1a1',
  area: 'rgba(42,120,214,0.08)',
  netWorth: '#2a78d6',
  income: '#2a78d6',
  expense: '#eb6834',
}

const dark: ChartPalette = {
  slots: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
  uncategorized: '#737373',
  area: 'rgba(57,135,229,0.12)',
  netWorth: '#3987e5',
  income: '#3987e5',
  expense: '#d95926',
}

// The parameter is useColorScheme's ColorSchemeName: anything that isn't
// affirmatively dark ('unspecified' included) renders the light palette.
export const chartPalette = (scheme: string | null | undefined): ChartPalette =>
  scheme === 'dark' ? dark : light
