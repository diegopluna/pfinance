# Motion and finish

**Status: proposed, ours to edit, not mirrored** — like `MOBILE.md`. The
design project has no motion spec; this is the one both clients are built
to until it does.

The direction is Emil Kowalski's: the animations in Sonner and Vaul, and
the principles behind them. Motion in Goblin exists to make a change feel
caused — a button feels pressed, a surface arrives from where it was
summoned, a number rolls to its next value — and to be over before anyone
has to wait for it. Nothing animates to be noticed. Everything animates
the same way.

## Principles

1. **Ease out, always, for anything entering or anything the user
   caused.** An ease-out spends its motion in the first frames, so the
   response reads as immediate and the settle as free. Ease-in-out is
   for an element already on screen changing place or size. Never ease-in
   for an entrance, and never linear for anything but a colour.
2. **Fast, then faster to leave.** Nothing in the UI takes longer than
   ~300ms; most things take 150–200. Exits are shorter than enters — the
   user has already moved on. Only a surface that travels its own height
   (a sheet) gets more, and it earns it with a front-loaded curve.
3. **A press lands within a frame.** Press-down is near-instant, the
   release is what eases. Tactility is confirmation, not decoration — the
   thing under the finger yields a little (scale, opacity, or both) and
   comes back.
4. **Springs only where a finger drives it.** A swipe carries velocity; a
   spring is the only curve that can inherit it. Everywhere else, timing
   with a curve — deterministic, and it ends when it says it will.
5. **Enter from the cause.** Popovers scale from their trigger, a sheet
   slides from its edge, a toast drops from where it lives, digits roll in
   the direction the value moved. Opacity alone is a fallback, never the
   design.
6. **Blur is a texture, not a trick.** A few pixels of blur on a large
   surface entering (a dialog) reads as depth of field; on small text it
   reads as a rendering glitch. Web dialogs only.
7. **Reduced motion is the whole animation, off.** Every animation in
   both clients honours the system setting: Reanimated's
   `ReduceMotion.System` on mobile, `motion-reduce:` on the web. Nothing
   degrades to a slower or smaller version; it simply happens.
8. **Haptics are for commitments.** A keypad key ticks; a segmented
   switch ticks; a write that landed confirms. Navigation, row taps and
   scrolling stay silent — the phone already does those.
9. **Restraint is the rest of the spec.** A list that redraws its bars on
   every scroll is noise; a ledger refetch that changes a balance swaps
   the number, it does not count it up. The inventory below is exhaustive
   on purpose: anything not in it does not animate.

## Vocabulary

One set of curves and durations, defined once per client —
`apps/mobile/src/motion.ts` and the `--ease-*` tokens in
`packages/ui/src/styles/globals.css` — and used everywhere by name.

| Name    | Curve                              | For                                                |
| ------- | ---------------------------------- | -------------------------------------------------- |
| `out`   | `cubic-bezier(0.25, 1, 0.5, 1)`    | entrances, exits, releases — the default           |
| `sheet` | `cubic-bezier(0.32, 0.72, 0, 1)`   | a surface travelling its own size (Vaul's drawer)  |
| `move`  | `cubic-bezier(0.45, 0, 0.55, 1)`   | an on-screen element changing size or position     |

| Moment                    | Enter | Exit | Curve   |
| ------------------------- | ----- | ---- | ------- |
| Press down / release      | 75–90 | 150  | `out`   |
| Surface (dialog, form)    | 200   | 150  | `out`   |
| Popover, select, tooltip  | 150   | 100  | `out`   |
| Side sheet                | 400   | 400  | `sheet` |
| Toast                     | 260   | 180  | `out`   |
| Digits rolling            | 180   | —    | `out`   |
| On-screen move            | 250   | —    | `move`  |
| Rail draw-in              | 380, staggered 35 | — | `out` |

Springs (`settle` in `motion.ts`): damping 28, stiffness 320, overshoot
clamped. Used once — the toast returning from an abandoned swipe.

## Inventory — mobile

| Where                                   | What                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `components/touchable.tsx`              | Press: scale 0.96 + opacity 0.7 (controls) or opacity 0.55 (rows). In 90ms, out 160ms.                 |
| `components/button.tsx`                 | heroui's Button with the press re-timed: scale 0.97, 160ms `out` — same hand as Touchable.             |
| `components/keypad.tsx`, `segmented.tsx`| Selection haptic on every key / switch (`haptics.ts`).                                                 |
| `components/rolling-figure.tsx`         | The keypad amount: changed digits roll in from below as the value grows, from above as it shrinks.     |
| `components/toaster.tsx`                | One toast at a time, top centre: drops in 260ms, leaves 180ms, swipe up to dismiss (spring back on an abandoned swipe), 2.6s otherwise. Fired by the write surfaces: transaction / transfer saved or deleted, adjustment recorded. Success haptic rides with it. |
| `components/rail.tsx`                   | Home's rail bars draw from the rule: 380ms `out`, staggered 35ms. Home only.                           |
| `transaction-form.tsx`, `transfer-form.tsx` | Replacing the ledger: fade + 6px rise + scale 0.985 in 200ms; fade out 150ms.                      |
| `app/(tabs)/insights.tsx`               | Switching dashboards: the incoming view rises in the same way.                                        |
| `adjust-balance-sheet.tsx`              | The consequence line (“Records a …”) rises in when its message changes, not per keystroke.            |
| `cleanup-sheet.tsx`                     | The progress bar moves to its next width, 250ms `move`.                                               |
| `app-lock-gate.tsx`                     | The cover appears instantly (it is a privacy cover) and fades out 150ms on unlock.                    |
| The three sheets                        | Unchanged: native page sheets. The system draws the card, the grabber and the drag-to-dismiss; Vaul is a web imitation of exactly this. |
| Tab bar, stack pushes                   | Unchanged: native.                                                                                    |

## Inventory — web

| Where                                     | What                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `button.tsx`                              | Press: scale 0.97, 75ms down, 150ms up. (Was a 1px depress with a 150ms `transition-all`.)                  |
| `dialog.tsx`, `alert-dialog.tsx`          | Opacity + scale 0.96 + 4px blur, 200ms in / 150ms out, via Base UI's starting/ending styles. Backdrop fades. |
| `popover.tsx`, `select.tsx`, `combobox.tsx`, `tooltip.tsx` | Opacity + scale 0.96 from the trigger's origin, 150 / 100. No slide, no blur.                 |
| `sheet.tsx`                               | A real slide from its edge, 400ms `sheet`, no fade on the panel. Backdrop fades on the same clock.          |
| `sidebar.tsx`                             | Collapse/expand on `move` instead of linear.                                                               |
| `sonner.tsx` (Emil's Sonner)              | Bottom-right toasts on the app's popover surface. Fired at the call sites: transaction / transfer / account / category saved, deletions, import confirmed or reverted, invite link copied, member removed, date format saved. |
| Charts                                    | Unchanged: `isAnimationActive={false}`. A chart that draws itself on every refetch is the noise rule above. |
| Route changes                             | Unchanged: none. A page is not a surface entering; it is the page.                                         |

## Surfaces that float

The mobile app has no cards and zero shadows by decision (`MOBILE.md`,
Layout). The toast is the one exception, because it is the one thing
that is genuinely above the screen rather than part of it: an inverted
pill — foreground fill, background text — which floats by contrast, so it
still needs no shadow. On the web, floating surfaces keep the existing
`shadow-lg` + hairline ring; nothing new was invented.

## Still open

- Number transitions beyond the keypad (a balance that changes under a
  refetch) are deliberately not animated; if the design project wants an
  odometer on the net-worth headline, `rolling-figure.tsx` is the piece.
- The web has no dark mode wiring at all (`.dark` is defined and never
  applied), so the Sonner theme is pinned to light. Out of scope here;
  noted so it is not read as a motion decision.
- Vaul on the web for narrow viewports — a bottom drawer instead of the
  side sheet — would be the faithful move if the web app ever gets a
  phone layout. It has none today.
