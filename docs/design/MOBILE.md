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

- Eyebrow: mono 500, 11px, uppercase, `letterSpacing: 1.1`
- Title: mono 500, 21px (`lg`: 26px on the connect flow, where the title is the whole screen)
- Hero figure: mono 500, 38px, `letterSpacing: -1.2`
- Body: sans 400, 15px/24 (`sm`: 13px/20)

No numbering anywhere. None of these screens is a sequence.

## Color

No new hues. The neutrals are the web's shadcn tokens from `packages/ui/src/styles/globals.css`, so the two clients of one Household read as one product, and every colored value is one the design project already decided (`DECISIONS.md`):

| Token     | Source                | Light     | Dark      |
| --------- | --------------------- | --------- | --------- |
| accent    | `--s1`                | `#2a78d6` | `#3987e5` |
| money in  | `--s1`                | `#2a78d6` | `#3987e5` |
| money out | `--s2`                | `#eb6834` | `#d95926` |
| success   | `--good`              | `#006300` | `#0ca30c` |
| danger    | `--crit`              | `#d03b3b` | web's dark `--destructive` |
| on-rule   | `--sx`                | `#a1a1a1` | `#737373` |

Money out is deliberately **not** a UI token — it means one thing, an outflow, and only the rail and the charts draw it. Income/expense are blue and orange, never green and red: that opposition is the CVD-validated one the charts already use.

## Layout

- **No cards.** A phone screen is already a card; drawing another one inside it only narrows the ledger. Structure is carried by hairlines (one weight, `--separator`, for borders and separators alike) and by the rail.
- Screen padding 20px (`px-5`); connect-flow screens 24px.
- Chrome is one line: back chevron, eyebrow + title, and the screen's one primary verb.
- Home is a screen, not a menu: household → net worth (which is also the doorway to its history) → this month as the two bars that moved it → Accounts → the remaining destinations. **New transaction** is pinned above the bottom safe area and never scrolls.
- Connect-flow screens are bottom-weighted, so a five-screen sequence reads as one surface being answered.

## Glyphs

Two, both drawn in SVG (`apps/mobile/src/components/chevron.tsx`): a chevron and a caret. No icon dependency. `▲`/`▼` are geometric-shapes codepoints a text face need not carry, and a missing glyph in the one place a fall is announced is not a risk worth taking. Everything else that needs a name gets a word.

## Motion

One moment: the home screen's rail bars draw out from the rule on mount, staggered 45ms, 420ms. Nothing else animates — a scrolling ledger that redraws its bars per row is noise. `useReducedMotion()` skips it entirely.

## Still open

- The mark (`components/wordmark.tsx`) is the rail in miniature, on the connect flow only. There is no app icon work here — `assets/images/` is untouched.
- Nothing in the mirror covers focus, hover, disabled, or loading states; the mobile app inherits heroui-native's.
- The Uncategorized **count** ("3 uncategorized transactions") that `DECISIONS.md` asks for is not in `/api/spending-by-category`'s response, so the Spending screen can't show it.
