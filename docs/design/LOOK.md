# The look

**Status: proposed, ours to edit, not mirrored** — like `MOBILE.md` and
`MOTION.md`. Adopted 2026-09-02 from direction **A · Mono** on the Goblin
Mobile canvas (Directions page), where B · Quiet accent and C · Paper
remain as the roads not taken.

The direction is Emil Kowalski's, read off his own work (emilkowal.ski,
Sonner, Vaul) rather than from memory: chrome in black and white with
colour reserved for data, warm off-white grounds, hairlines drawn as
low-alpha rings, depth from a layered shadow rather than a border, an
inset highlight along the top of a dark control, small quiet type in
400–600, and pills for the things you press. Geist stays — it is Vercel's
face, the era his taste comes from; his Inter is the one overused choice
not worth copying.

## Decisions

1. **The chrome is monochrome.** The primary action, the selected tab, a
   primary chip, a link: all the foreground, inverted where it is a fill.
   Colour belongs to data — the money-in blue and money-out orange in the
   rail and the charts, the gain green and the loss red on a figure — and
   is never spent on a control. This retires the darkened-blue accent that
   `MOBILE.md` records as a contrast workaround: black on the ground is
   17:1, no workaround needed. Focus keeps a blue ring, the one place a
   hue means "the system is pointing".
2. **The ground is off-white; surfaces are white and lift.** Light:
   `oklch(0.985 0 0)` (his `#fafafa`) under white plates and cards. Fills
   that used to sit on pure white step one notch darker (`0.955`) so they
   still read. Dark: unchanged neutrals; a surface is told apart by an 8%
   white edge rather than a shadow.
3. **Depth is the lift, not a border.** One recipe, both clients:

   ```
   0 0 0 1px rgba(0,0,0,.06), 0 1px 0 0 rgba(0,0,0,.08),
   0 2px 2px 0 rgba(0,0,0,.04), 0 3px 3px 0 rgba(0,0,0,.02),
   0 4px 4px 0 rgba(0,0,0,.01)
   ```

   A hairline as a 6% ring, then four shadows that each halve. Cards on
   the web, plates on the phone, outline buttons and the quiet icon button
   wear it; nothing wears a 1px `border` to say "I am a surface". A field
   keeps its border — it is the edge of a control, not a surface — and
   gains a 4% inset shadow.
4. **A dark control wears a highlight.** `inset 0 1px 0 rgba(255,255,255,.12)`
   along the top edge of a primary button and the prominent icon button,
   plus a 1.5px drop on the phone. It is the difference between a black
   rectangle and a button.
5. **Pills on the phone, 8px on the web.** heroui already draws the app's
   buttons as pills (24px radius on a 48px control), which is Vaul's
   shape; the web keeps the Claude Design 8px control radius, Sonner's
   shape. A platform difference, not a drift.
6. **Hairlines stay the structure.** `MOBILE.md`'s rule holds inside a
   plate and between rows: one weight, `--separator`. What changed is
   only what a plate *is* — a lifted surface, not a grey fill.
7. **Type is untouched.** The `--text-*` scale, Geist 400–600, tabular
   figures in the sans, the mono for identifiers. Emil's lighter
   secondary grey (`#989898`, 2.9:1) was considered with direction C and
   not taken: the muted token stays at `oklch(0.556)` (4.5:1 at 13px).

## Where it lives

| Client | Tokens                                        | Surfaces                                      |
| ------ | --------------------------------------------- | --------------------------------------------- |
| Mobile | `src/global.css` (`--background`, `--accent`, `--link`, `--surface-secondary`) | `components/plate.tsx` (`Plate`, `PlateTouchable`, `useControlDepth`), `button.tsx`, `icon-button.tsx` |
| Web    | `globals.css` (`--background`, fills, `--lift`, `--field-shadow`, `--highlight` → `shadow-lift`, `shadow-field`, `shadow-highlight`) | `card.tsx`, `button.tsx` (default + outline), `input.tsx`, `textarea.tsx`, `select.tsx`, `input-group.tsx`, `combobox.tsx` |

## Still open

- The chart wash and the rail palette are untouched and stay
  CVD-validated (`DECISIONS.md`); a mono chrome next to them is exactly
  the point.
- Native page sheets and the native tab bar draw themselves; the tab
  bar reads the accent token and turns black with it.
- Dark mode on the web is defined and still never applied
  (`MOTION.md`, Still open).
