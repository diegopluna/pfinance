# Mobile design — the rail

**Status: proposed, not yet adopted by the design project.** `docs/design/DECISIONS.md` records "no mobile or tablet layouts — every frame is 1280px wide" as a real gap, and this file is what the mobile app was built to while that gap stands. Everything here is a decision that belongs in the Claude Design project ("pfinance", see `docs/agents/design.md`); until it lands there and is mirrored back, this file is the mobile baseline and the `.dc.html` mirror stays authoritative for the web.

Ours to edit, like `DECISIONS.md`. Not mirrored.

## What the phone is for

The web app administers the Household — accounts, categories, imports, members. The phone does two things: **write to the Ledger** (the highest-frequency task in the product, issue #70) and **read where the household stands**. Every layout choice below follows from that split.

## The rail

The one device, and the reason the mobile app doesn't look like the web app scaled down.

Every **signed** quantity hangs off a single shared zero rule: money out runs left of it, money in runs right. A Transaction's amount, an Account's Balance, a month's income and expense are the same picture at three scales, so a list is also a chart — no tooltip, no second screen, no hover a phone doesn't have.

It encodes the domain rather than decorating it:

- Direction is the **sign**, never the kind (ADR 0001). A liability's Balance leans left for the same reason a grocery bill does.
- A Transfer leg or Balance Adjustment draws **no bar at all**, only its tick on the rule — because it is neither spending nor income "by definition." The rule every spending surface states in a footnote is visible in the geometry.
- The scale is the **75th-percentile magnitude in view**, so one salary can't flatten a month of groceries into stubs: the top quarter overflows the frame instead of the rest disappearing into it. A bar past the cap runs to the frame and ends **square**; an ordinary bar ends **round**. Shape, not color, says "this ran past the frame." (90th was tried first and put the cap on the salary itself — everything under it went flat.)
- Bars **rescale with the filters**: they answer "how does this compare to what I'm looking at," which is the only comparison the screen actually shows.

Where the rule sits: `0.62` on a ledger (mostly outflows, and it lands in the gap between a description and its right-aligned amount), `0.5` where two aggregates of the same order are compared.

**The rail means a sign.** Spending by Category is one direction — magnitudes only — so it uses plain left-anchored bars in the CVD-validated slot colors instead. Giving those a zero rule would claim a comparison the data doesn't make.

Geometry: `apps/mobile/src/charts/rail.ts` (pure, tested). Drawing: `apps/mobile/src/components/rail.tsx`.

## Type

Two families, three roles.

| Role                                        | Face                    |
| ------------------------------------------- | ----------------------- |
| Prose                                       | Spline Sans 400/500/600 |
| Figures, eyebrows, screen titles, addresses | Spline Sans Mono 400/500/600 |

The mono is the display voice, not a code accent: a ledger is a column of aligned digits, and a monospaced face aligns them by construction — `font-variant-numeric: tabular-nums` only does anything if the loaded face ships the feature, while a mono has nothing to opt into. Anything that is a **key** (a Server address, a month label, a category label above a chart) is set in it; anything a person **reads as a sentence** is set in the sans.

`--font-normal` … `--font-bold` in `apps/mobile/src/global.css` bind the sans, so heroui-native's own component CSS picks it up, and `font-medium` / `font-semibold` resolve to the weight's own font file (React Native does not synthesize weights on static TTFs).

The scale lives in one place — the `--text-*` block in `src/global.css`, named by job rather than size:

| Token | Size | Used by |
| --- | --- | --- |
| `--text-caption` | 10px | badges, tab-bar labels |
| `--text-eyebrow` | 11px | eyebrows, switcher, chart month labels |
| `--text-body-sm` | 13px | secondary prose, small figures, addresses |
| `--text-body` | 15px | prose, figures, doorway labels |
| `--text-figure-lg` | 19px | a section's own total |
| `--text-title` | 21px | screen titles |
| `--text-title-lg` | 26px | connect-flow titles |
| `--text-hero` | 38px | the net-worth headline |

Letterspacing: eyebrow `1.1`, title `-0.3` (`lg` `-0.6`), hero `-1.2`, badge `0.8`.

**Line heights are multiplied by the current font scale, never fixed.** React Native scales `fontSize` with the OS text-size setting but leaves a `lineHeight` given in points exactly where it was, so a fixed leading crushes its own text the moment someone turns type size up. `useLineHeight` in `components/type.tsx` applies the ratio against `useWindowDimensions().fontScale`, which re-reads when the setting changes. Ratios: eyebrow 1.3, title 1.2, body 1.6 (`sm` 1.54), hero 1.16. Everything else inherits the platform's own leading, which already tracks the size.

No numbering anywhere. None of these screens is a sequence.

## Color

No new hues. The neutrals are the web's shadcn tokens from `packages/ui/src/styles/globals.css`, so the two clients of one Household read as one product, and every colored value is one the design project already decided (`DECISIONS.md`):

| Token     | Source                | Light     | Dark      |
| --------- | --------------------- | --------- | --------- |
| accent    | `--s1`, darkened      | `#2070ce` | `#3987e5` |
| money in  | `--s1`                | `#2a78d6` | `#3987e5` |
| money out | `--s2`                | `#eb6834` | `#d95926` |
| success   | `--good`              | `#006300` | `#0ca30c` |
| danger    | `--crit`              | `#d03b3b` | web's dark `--destructive` |
| on-rule   | `--sx`                | `#a1a1a1` | `#737373` |

Money out is deliberately **not** a UI token — it means one thing, an outflow, and only the rail and the charts draw it. Income/expense are blue and orange, never green and red: that opposition is the CVD-validated one the charts already use.

**The chrome accent and the data blue are separate values, on purpose.** At `--s1`'s own `#2a78d6` the accent measured 4.42:1 as text on the background and 4.31:1 under heroui's near-white Button label — both below the 4.5:1 that the app's primary action and its tab labels need. The UI token is one step darker (`L 0.575 → 0.55`, chroma and hue untouched): 4.91:1 and 4.79:1. `--s1` itself is unchanged in `src/charts/palette.ts`, where it is a data colour on a plain background and where the CVD validation was actually run.

In dark, `#3987e5` stays (5.44:1 as text) and its *foreground* flips to near-black instead — near-white on that blue is 3.55:1, near-black is 5.44:1. heroui does the same for `--success-foreground` in this theme.

**This split is a decision for the design project, not for this repo to keep owning.** `--s1` was validated as a chart colour; extending it to control surfaces is the mobile app's doing, and so is the failure. Raise it alongside the rest of this file.

## Navigation

A bottom tab bar, four tabs: **Home · Ledger · Insights · Settings**. Everything else is pushed above it by the root stack — the connect flow, the Accounts list, a form — which is what makes those read as somewhere you went rather than somewhere you are.

Four, not five. The three dashboards share the Insights tab behind a switcher (`Net worth · Spending · In vs out`), because a tab bar with three slots that all mean "a chart" isn't doing its job. A switcher rather than one long scroll: each dashboard reads a different window — net worth runs to the first month of the ledger, in-vs-out holds twelve, spending is one calendar month with a stepper — and stacking them would put three time frames under one scrollbar. Accounts stays a push off Home; it's a list you consult, not a place you live.

Tab labels are the app's eyebrow — mono, uppercase, letterspaced — so the bar speaks in the same voice as every section heading above it. A focused tab changes color and nothing else.

**The bar is native** (`expo-router/unstable-native-tabs`), which on iOS 26 means the system draws it in Liquid Glass and derives it from whatever scrolls underneath.

This was first built the other way — a `GlassView` from `expo-glass-effect` placed behind the JS `Tabs` navigator — to keep the drawn icons and the eyebrow labels. It does not work, and the docs are explicit: *"Liquid Glass support is exclusive to Native Tabs. The JavaScript Tabs navigator does not support Liquid Glass styling."* Glass behind a JS bar is a translucent rectangle, not the material.

Adopting the system bar means adopting its **iconography**: SF Symbols on iOS, Material on Android, replacing the four hand-drawn glyphs. That is the right trade for the same reason those glyphs were conventional in the first place — a tab bar is read from the corner of the eye, and it is the one place in this app that should look like every other app. It also gets the filled-on-selected state the drawn set could not, since only two of those four shapes could carry a fill.

What survives is the **type**: `labelStyle` takes a `fontFamily`, so the labels stay Spline Sans Mono. They lose the eyebrow's uppercasing and tracking — a native label has no `text-transform` or `letterSpacing` — so they are sentence case, which is what the platform's own bars use anyway. `backgroundColor` and `blurEffect` are deliberately unset: on iOS 26 they do nothing.

The bar owns its **content insets** (`disableAutomaticContentInsets` is off by default), so no screen pads for it by hand; scrollers set `contentInsetAdjustmentBehavior="automatic"` and let UIKit inset them. Home's pinned action strip stays opaque and takes the bottom safe area itself — a full-width button with the ledger showing through it is a worse trade than the glass makes on that one screen.

The root layout wraps the app in react-navigation's `ThemeProvider` carrying the `--background` token: without it the frame under the native bar is the navigator's default white, which flashes on every tab switch in dark mode.

**Insets follow the bar.** A tab root leaves the bottom inset to the tab bar; a pushed screen covers the bar and owns it. `ListScreen` reads that off its own `back` prop — the back button is exactly what tells the two apart.

## Layout

- **No cards.** A phone screen is already a card; drawing another one inside it only narrows the ledger. Structure is carried by hairlines (one weight, `--separator`, for borders and separators alike) and by the rail.
- **One exception to the single hairline: `--field-border`.** With `--field-shadow` zeroed, a field's outline is the only thing identifying it as a control, which WCAG 1.4.11 asks to clear 3:1 against its own fill. The hairline measured 1.26:1; the field border is `oklch(0.65)` / `white 35%` at 3.23:1. Structure is a hairline; the edge of a control is not.
- **A control never looks like a caption.** The Insights switcher was an underline under three bare labels — the same type as the section eyebrows above it — and read as a caption row. It is a segmented track now: neutral fill, raised thumb, both labels at full contrast (muted on the track measured 4.34:1, under the 4.5:1 an 11px label needs). Concentric radii: an 8px track with 4px padding takes a 4px thumb.
- Screen padding 20px (`px-5`); connect-flow screens 24px.
- Chrome is one line: back chevron (pushed screens only), eyebrow + title, and the screen's one primary verb.
- Home is a screen, not a menu: household → net worth (which is also the doorway to its history) → this month as the two bars that moved it → Accounts. **New transaction** is pinned directly on the tab bar and never scrolls — no hairline of its own, or the two rules read as two footers instead of one place to act.
- Connect-flow screens are bottom-weighted, so a five-screen sequence reads as one surface being answered.

## Glyphs

Two, both drawn in SVG, no icon dependency: a chevron and a caret (`components/chevron.tsx`). The tab bar is the exception and does not use them — it is native, so its icons are SF Symbols and Material glyphs (see Navigation). `▲`/`▼` are geometric-shapes codepoints a text face need not carry, and a missing glyph in the one place a fall is announced is not a risk worth taking. Everything else that needs a name gets a word.

The tab icons went through two rounds before landing on the system set. Drawn from the rail itself (rows hanging off a rule, the diverging pair) they collapsed into a plus sign at 24px; redrawn as conventional house/list/bars/sliders they read correctly, and were then given up entirely when the bar went native. The conclusion held each time, it just kept getting stronger: that bar should look like every other app's.

## Motion

One moment: the home screen's rail bars draw out from the rule on mount, staggered 45ms, 420ms. Nothing else animates — a scrolling ledger that redraws its bars per row is noise. `useReducedMotion()` skips it entirely.

## Motion, second pass

The form no longer replaces the ledger as a jump cut: both forms crossfade in at 160ms and out at 110ms (exits shorter than enters), skipped entirely under the system's reduced-motion setting. That and the home rail's draw-in are the only two animations in the app. Press feedback is deliberately instant — a press is the highest-frequency interaction there is, and an easing ramp on every tap of every row spends attention it cannot earn back.

## Still open

- The mark (`components/wordmark.tsx`) is the rail in miniature, on the connect flow only. There is no app icon work here — `assets/images/` is untouched.
- Nothing in the mirror covers focus, hover, disabled, or loading states; the mobile app inherits heroui-native's.
- The Uncategorized **count** ("3 uncategorized transactions") that `DECISIONS.md` asks for is not in `/api/spending-by-category`'s response, so the Spending screen can't show it.
